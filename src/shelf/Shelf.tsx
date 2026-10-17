import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/store'
import { platform, isTouchDevice } from '../platform'
import type { LibraryFolders } from '../platform/types'
import { useLibrary } from '../library/store'
import { db } from '../library/db'
import { syncLibrary } from '../library/scanner'
import { useReaderSettings, effectiveTheme } from '../reader/comfort/settings'
import { AmbientBackground } from './AmbientBackground'
import { createMotion, OPEN_MS, Shelf3D } from './Shelf3D'
import { Icon } from '../ui/Icon'
import './shelf.css'

export function Shelf({ active }: { active: boolean }) {
  const books = useLibrary(s => s.books)
  const progress = useLibrary(s => s.progress)
  const loaded = useLibrary(s => s.loaded)
  const scanning = useLibrary(s => s.scanning)
  const openBook = useApp(s => s.openBook)
  const motion = useMemo(createMotion, [])
  const [center, setCenter] = useState(0)
  const [opening, setOpening] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const curtainColor = useReaderSettings(s => effectiveTheme(s).bg)
  const wasActive = useRef(active)

  const book = books[Math.min(center, books.length - 1)] ?? null

  // al volver del lector, el libro que leías queda al centro (es el primero)
  useEffect(() => {
    if (active && !wasActive.current) {
      motion.openingAt = null
      motion.intensity.current = 1
      motion.ctrl.jumpTo(0)
      setCenter(0)
      setOpening(false)
    }
    wasActive.current = active
  }, [active, motion])

  const open = (index: number) => {
    const target = books[index]
    if (!target || opening) return
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
      if (foldersOpen) return
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
    <section className="shelf" data-active={active} data-opening={opening} aria-hidden={!active}>
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
        </div>
        <div className="shelf-actions">
          {books.length > 0 && (
            <span className="shelf-count">
              {center + 1} / {books.length}
            </span>
          )}
          <button className="icon-button" onClick={() => setFoldersOpen(true)} title="Carpetas de libros">
            <Icon name="folder" />
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

      {loaded && books.length === 0 && !scanning && <EmptyState onFolders={() => setFoldersOpen(true)} />}
      {scanning && (
        <div className="scan-toast">
          Leyendo libros… {scanning.done} / {scanning.total}
        </div>
      )}
      {foldersOpen && <FoldersPanel onClose={() => setFoldersOpen(false)} />}
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

function FoldersPanel({ onClose }: { onClose(): void }) {
  const [folders, reload] = useFolders()
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
