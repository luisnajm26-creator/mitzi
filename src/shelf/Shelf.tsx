import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/store'
import { platform, isTouchDevice } from '../platform'
import type { LibraryFolders } from '../platform/types'
import { useLibrary } from '../library/store'
import { db } from '../library/db'
import { retryFailed, syncLibrary } from '../library/scanner'
import { carouselBooks, useLibraryQuery, type CarouselFilter } from '../library/query'
import { Explorer } from './Explorer'
import { About } from './About'
import { UpdateToast } from './UpdateToast'
import { useReaderSettings, effectiveTheme } from '../reader/comfort/settings'
import { AmbientBackground } from './AmbientBackground'
import { CLOSE_MS, createMotion, OPEN_MS, Shelf3D } from './Shelf3D'
import { useBackHandler } from '../app/back'
import { hideSplashAfterPaint } from '../app/splash'
import { Icon } from '../ui/Icon'
import './shelf.css'

export function Shelf({ active }: { active: boolean }) {
  const allBooks = useLibrary(s => s.books)
  const carouselFilter = useLibraryQuery(s => s.carousel)
  const setCarouselFilter = useLibraryQuery(s => s.setCarousel)
  // el carrusel muestra todo, o solo la serie o el autor elegidos en el explorador
  const books = useMemo(() => carouselBooks(allBooks, carouselFilter), [allBooks, carouselFilter])
  const [explorerOpen, setExplorerOpen] = useState(false)
  /** libro que se eligió en el explorador: el carrusel lo busca cuando la lista se actualiza */
  const pendingPick = useRef<string | null>(null)
  const progress = useLibrary(s => s.progress)
  const loaded = useLibrary(s => s.loaded)
  // biblioteca vacía: no hay libro que esperar para quitar la pantalla de inicio
  useEffect(() => {
    if (loaded && allBooks.length === 0) hideSplashAfterPaint()
  }, [loaded, allBooks.length])
  const scanning = useLibrary(s => s.scanning)
  const failed = useLibrary(s => s.failed)
  const [failedOpen, setFailedOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const openBook = useApp(s => s.openBook)
  const motion = useMemo(createMotion, [])
  const [center, setCenter] = useState(0)
  const [opening, setOpening] = useState(false)
  const [closing, setClosing] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const curtainColor = useReaderSettings(s => effectiveTheme(s).bg)
  const wasActive = useRef(active)

  const book = books[Math.min(center, books.length - 1)] ?? null

  useEffect(() => {
    const id = pendingPick.current
    if (!id) return
    pendingPick.current = null
    const index = books.findIndex(b => b.id === id)
    if (index < 0) return
    // cerca: se desliza; lejos: salta directo para no recorrer cientos de libros
    if (Math.abs(index - motion.ctrl.center) > 8) motion.ctrl.jumpTo(index)
    else motion.ctrl.goTo(index)
    motion.wake?.()
  }, [books, motion])

  const pickBook = (id: string) => {
    setExplorerOpen(false)
    pendingPick.current = id
    if (carouselFilter && !books.some(b => b.id === id)) setCarouselFilter(null)
    else {
      // la lista no cambia: se busca ya
      const index = books.findIndex(b => b.id === id)
      if (index >= 0) {
        pendingPick.current = null
        if (Math.abs(index - motion.ctrl.center) > 8) motion.ctrl.jumpTo(index)
        else motion.ctrl.goTo(index)
        motion.wake?.()
      }
    }
  }

  const showGroup = (filter: CarouselFilter) => {
    setExplorerOpen(false)
    setCarouselFilter(filter)
    motion.ctrl.jumpTo(0)
    setCenter(0)
    motion.wake?.()
  }

  // al volver del lector, el libro que leías (ahora el primero) se cierra y vuelve a su lugar
  useEffect(() => {
    if (active && !wasActive.current) {
      motion.openingAt = null
      motion.ctrl.jumpTo(0)
      setCenter(0)
      setOpening(false)
      motion.closingAt = performance.now()
      motion.wake?.()
      setClosing(true)
      const id = setTimeout(() => setClosing(false), CLOSE_MS)
      wasActive.current = active
      return () => clearTimeout(id)
    }
    wasActive.current = active
  }, [active, motion])

  const open = (index: number) => {
    const target = books[index]
    if (!target || opening || closing) return
    motion.ctrl.jumpTo(index)
    motion.openingAt = performance.now()
    motion.wake?.()
    setOpening(true)
    db.books.update(target.id, { lastOpenedAt: Date.now() })
    setTimeout(() => openBook(target.id), OPEN_MS)
  }

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (foldersOpen || explorerOpen) return
      if (e.key === 'ArrowRight') motion.ctrl.step(1)
      else if (e.key === 'ArrowLeft') motion.ctrl.step(-1)
      else if (e.key === 'Home') motion.ctrl.goTo(0)
      else if (e.key === 'End') motion.ctrl.goTo(books.length - 1)
      else if (e.key === 'Enter' || e.key === ' ') open(motion.ctrl.center)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const p = book ? progress[book.id] : undefined
  const percent = p ? Math.round(p.fraction * 100) : 0

  return (
    <section className="shelf" data-active={active} data-opening={opening || closing} aria-hidden={!active}>
      <AmbientBackground palette={book?.palette ?? null} />
      {books.length > 0 && (
        <Shelf3D
          books={books}
          motion={motion}
          palette={book?.palette ?? null}
          active={active}
          onCenterChange={setCenter}
          onOpen={open}
        />
      )}

      <header className="shelf-top">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          <span>Mitzi</span>
          {carouselFilter && (
            <button
              className="filter-chip"
              onClick={() => {
                setCarouselFilter(null)
                motion.ctrl.jumpTo(0)
                setCenter(0)
              }}
              title="Ver todos los libros"
            >
              {carouselFilter.kind === 'serie' ? 'Serie' : 'Autor'}: {carouselFilter.label}
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <div className="shelf-actions">
          {books.length > 0 && (
            <span className="shelf-count">
              {center + 1} / {books.length}
            </span>
          )}
          {allBooks.length > 0 && (
            <button className="icon-button" onClick={() => setExplorerOpen(true)} title="Buscar y explorar la biblioteca" aria-label="Buscar">
              <Icon name="search" />
            </button>
          )}
          <button className="icon-button" onClick={() => setFoldersOpen(true)} title="Carpetas de libros">
            <Icon name="folder" />
          </button>
          <button className="icon-button" onClick={() => setAboutOpen(true)} title="Acerca de Mitzi" aria-label="Acerca de Mitzi">
            <Icon name="info" />
          </button>
          {!isTouchDevice && (
            <button className="icon-button" onClick={() => platform.toggleFullscreen()} title="Pantalla completa (F11)">
              <Icon name="fullscreen" />
            </button>
          )}
        </div>
      </header>

      {book && (
        <div className="shelf-info" key={book.id}>
          <h1 className="shelf-title">{book.title}</h1>
          {book.author && <p className="shelf-author">{book.author}</p>}
          {book.series && book.seriesIndex !== undefined && (
            <p className="shelf-series">
              {book.series} · Tomo {book.seriesIndex}
            </p>
          )}
          <div className="shelf-meta">
            <span className="badge">{book.format.toUpperCase()}</span>
            {p ? (
              <span className="shelf-progress">
                <span className="bar">
                  <span style={{ width: `${percent}%` }} />
                </span>
                {percent}%
              </span>
            ) : (
              <span className="shelf-new">Sin empezar</span>
            )}
          </div>
          <button className="read-button" onClick={() => open(center)}>
            {p ? 'Continuar' : 'Leer'}
          </button>
        </div>
      )}

      {books.length > 1 && !isTouchDevice && (
        <>
          <button className="shelf-arrow left" onClick={() => motion.ctrl.step(-1)} aria-label="Libro anterior" disabled={center === 0}>
            <Icon name="chevron-left" />
          </button>
          <button className="shelf-arrow right" onClick={() => motion.ctrl.step(1)} aria-label="Libro siguiente" disabled={center === books.length - 1}>
            <Icon name="chevron-right" />
          </button>
        </>
      )}

      {loaded && allBooks.length === 0 && !scanning && <EmptyState onFolders={() => setFoldersOpen(true)} />}
      {scanning && (
        <div className="scan-toast">
          Leyendo libros… {scanning.done} / {scanning.total}
        </div>
      )}
      {!scanning && failed.length > 0 && (
        <button className="scan-toast warn" onClick={() => setFailedOpen(true)}>
          {failed.length === 1 ? '1 libro no se pudo leer' : `${failed.length} libros no se pudieron leer`}
        </button>
      )}
      {failedOpen && <FailedPanel onClose={() => setFailedOpen(false)} />}
      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
      {/* mientras se leen libros, arriba está ese aviso: este espera */}
      {!scanning && <UpdateToast />}
      {foldersOpen && <FoldersPanel onClose={() => setFoldersOpen(false)} />}
      {explorerOpen && <Explorer onClose={() => setExplorerOpen(false)} onPick={pickBook} onShowGroup={showGroup} />}
      <div
        className="shelf-curtain"
        data-on={opening}
        style={{
          background: curtainColor,
          // la cortina cae justo cuando la cámara entra a la primera página
          transitionDelay: opening ? `${OPEN_MS * 0.74}ms` : '0ms',
          transitionDuration: opening ? `${OPEN_MS * 0.26}ms` : '0ms',
        }}
      />
    </section>
  )
}

function useFolders() {
  const [folders, setFolders] = useState<LibraryFolders | null>(null)
  const reload = () => platform.getFolders().then(setFolders).catch(() => setFolders({ folders: [], defaultFolder: null }))
  useEffect(() => {
    reload()
  }, [])
  return [folders, reload] as const
}

const label = (folder: string) => platform.folderLabel?.(folder) ?? folder

/** Agrega una carpeta y vuelve a revisar la biblioteca. */
const addFolder = async () => {
  if (await platform.addFolder()) await syncLibrary()
}

function EmptyState({ onFolders }: { onFolders(): void }) {
  const [folders] = useFolders()
  const folder = folders?.defaultFolder
  if (platform.kind === 'android')
    return (
      <div className="empty-state">
        <div className="empty-glow" />
        <h2>Tu biblioteca está vacía</h2>
        <p>
          Mitzi no trae libros. Elige la carpeta del teléfono donde guardas tus <strong>EPUB</strong> o <strong>PDF</strong> y
          aparecerán aquí solos.
        </p>
        <div className="empty-actions">
          <button className="read-button" onClick={addFolder}>
            Elegir carpeta
          </button>
        </div>
        <p className="hint">También puedes abrir un libro desde el gestor de archivos con «Abrir con Mitzi».</p>
      </div>
    )
  return (
    <div className="empty-state">
      <div className="empty-glow" />
      <h2>Tu biblioteca está vacía</h2>
      <p>
        Mitzi no trae libros: agrega tus archivos <strong>EPUB</strong> o <strong>PDF</strong> a esta carpeta y aparecerán
        aquí solos.
      </p>
      {folder && <code className="folder-path">{folder}</code>}
      <div className="empty-actions">
        {folder && platform.kind === 'electron' && (
          <button className="read-button" onClick={() => platform.revealFolder(folder)}>
            Abrir carpeta
          </button>
        )}
        {platform.canManageFolders && (
          <button className="ghost-button" onClick={onFolders}>
            Usar otra carpeta
          </button>
        )}
      </div>
      {platform.kind === 'electron' && <p className="hint">También puedes arrastrar libros a esta ventana.</p>}
    </div>
  )
}

/** Qué libros fallaron y por qué: para reportarlo o reintentar. */
function FailedPanel({ onClose }: { onClose(): void }) {
  const failed = useLibrary(s => s.failed)
  useBackHandler(true, onClose)
  const engine = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Libros que no se pudieron leer">
        <header className="sheet-header">
          <h2>Libros que no se pudieron leer</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        <p className="sheet-note">
          Mitzi siguió con los demás. Si vuelve a pasar, manda una captura de esta lista
          {engine ? ` (navegador interno: Chrome ${engine})` : ''}.
        </p>
        <ul className="folder-list failed-list">
          {failed.map((f, i) => (
            <li key={i}>
              <strong>{f.name}</strong>
              <small>{f.reason}</small>
            </li>
          ))}
        </ul>
        <button
          className="read-button"
          onClick={() => {
            onClose()
            retryFailed()
          }}
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}

function FoldersPanel({ onClose }: { onClose(): void }) {
  const [folders, reload] = useFolders()
  useBackHandler(true, onClose)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Carpetas de libros">
        <header className="sheet-header">
          <h2>Carpetas de libros</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        <p className="sheet-note">Mitzi revisa estas carpetas (y sus subcarpetas) y muestra los EPUB y PDF que encuentre.</p>
        <ul className="folder-list">
          {folders?.folders.map(folder => (
            <li key={folder}>
              <code>{label(folder)}</code>
              <div className="folder-actions">
                {platform.kind === 'electron' && (
                  <button className="ghost-button small" onClick={() => platform.revealFolder(folder)}>
                    Abrir
                  </button>
                )}
                {platform.canManageFolders && folder !== folders.defaultFolder && (
                  <button className="ghost-button small" onClick={() => platform.removeFolder(folder).then(reload).then(() => syncLibrary())}>
                    Quitar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {platform.canManageFolders ? (
          <button className="read-button" onClick={() => addFolder().then(reload)}>
            Agregar carpeta
          </button>
        ) : (
          <p className="sheet-note">En el navegador de desarrollo se usa la carpeta libros-prueba del proyecto.</p>
        )}
      </div>
    </div>
  )
}
