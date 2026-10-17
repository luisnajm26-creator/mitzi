import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { mix } from '../lib/color'
import { useApp } from '../app/store'
import { db, type BookRecord } from '../library/db'
import { refreshLibrary } from '../library/store'
import { isTouchDevice, platform } from '../platform'
import { Icon } from '../ui/Icon'
import { ComfortPanel } from './ComfortPanel'
import { effectiveSettings, effectiveTheme, useReaderSettings } from './comfort/settings'
import { EpubEngine } from './engines/epubEngine'
import { PdfEngine } from './engines/pdfEngine'
import type { EngineCallbacks, ReaderEngine, ReaderLocation, TocEntry, ViewOptions } from './engines/types'
import { computeBookGeometry, OpenBookBase, OpenBookGutter } from './layouts/OpenBook'
import { PageTurner } from './pageTurn/PageTurner'
import { TocPanel } from './TocPanel'
import './reader.css'

type Panel = null | 'toc' | 'comfort'

export default function Reader({ bookId }: { bookId: string }) {
  const closeBook = useApp(s => s.closeBook)
  const leaving = useApp(s => s.leaving)
  const global = useReaderSettings(s => s.global)
  const perBook = useReaderSettings(s => s.perBook)
  const [clock, setClock] = useState(() => Date.now())
  const settings = useMemo(() => effectiveSettings({ global, perBook }, bookId), [global, perBook, bookId])
  // `clock` cambia cada minuto para que el modo noche se active a su hora
  const theme = useMemo(() => effectiveTheme({ global, perBook }, bookId, new Date()), [global, perBook, bookId, clock])

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const turnLayerRef = useRef<HTMLDivElement>(null)
  const turnerRef = useRef<PageTurner | null>(null)
  const engineRef = useRef<ReaderEngine | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [pageAspect, setPageAspect] = useState(0.66)
  const [book, setBook] = useState<BookRecord | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loc, setLoc] = useState<ReaderLocation | null>(null)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [scrub, setScrub] = useState<number | null>(null)

  const pending = useRef<ReaderLocation | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wheel = useRef({ acc: 0, lockUntil: 0 })

  // libro abierto de dos páginas en pantallas horizontales (si se lee por páginas)
  const bookGeo = useMemo(
    () =>
      book && settings.flow === 'paginated' && settings.spread === 'auto' && (book.format === 'epub' || settings.pdfFit === 'page')
        ? computeBookGeometry(size.w, size.h, pageAspect, book.pages)
        : null,
    [book, settings.flow, settings.spread, settings.pdfFit, size.w, size.h, pageAspect],
  )
  const view = useMemo<ViewOptions>(() => ({ bookMode: !!bookGeo, pageWidth: bookGeo?.pageWidth ?? 0 }), [bookGeo])

  const latest = useRef({ settings, theme, panel, view })
  latest.current = { settings, theme, panel, view }

  const saveNow = useCallback(async () => {
    const l = pending.current
    if (!l) return
    pending.current = null
    await db.progress.put({ bookId, location: l.location, fraction: l.fraction, chapter: l.chapter, updatedAt: Date.now() })
  }, [bookId])

  const back = useCallback(async () => {
    clearTimeout(saveTimer.current)
    await saveNow()
    await refreshLibrary()
    closeBook()
  }, [saveNow, closeBook])

  /** Pasa de página, con la hoja que gira si la animación está activada. */
  const turn = useCallback((dir: 1 | -1) => {
    const engine = engineRef.current
    const stage = stageRef.current
    if (!engine || !stage) return
    const { settings: s, theme: t, view: v } = latest.current
    const paged = engine.format === 'pdf' || s.flow === 'paginated'
    if (!s.animatePages || !paged || !turnerRef.current) {
      if (dir > 0) engine.next()
      else engine.prev()
      return
    }
    turnerRef.current.turn(engine, dir, { book: v.bookMode, pages: stage.getBoundingClientRect(), bg: t.bg, dark: t.dark })
  }, [])

  // acciones que llaman los motores; leen siempre el estado más reciente
  const actions = useRef({
    tap(_x: number) {},
    key(_e: KeyboardEvent) {},
    wheel(_e: WheelEvent) {},
  })
  actions.current = {
    tap(x) {
      if (latest.current.panel) {
        setPanel(null)
        return
      }
      const engine = engineRef.current
      const w = window.innerWidth
      const paged = latest.current.settings.flow === 'paginated' || engine?.format === 'pdf'
      if (paged && x < w * 0.28) {
        turn(-1)
        setChrome(false)
      } else if (paged && x > w * 0.72) {
        turn(1)
        setChrome(false)
      } else setChrome(c => !c)
    },
    key(e) {
      if (['ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) turn(1)
      else if (['ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) turn(-1)
      else if (e.key === 'Escape') {
        if (latest.current.panel) setPanel(null)
        else back()
      } else return
      e.preventDefault()
    },
    wheel(e) {
      if (latest.current.settings.flow !== 'paginated' && engineRef.current?.format === 'epub') return
      const w = wheel.current
      const now = performance.now()
      w.acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (now < w.lockUntil || Math.abs(w.acc) < 50) return
      turn(w.acc > 0 ? 1 : -1)
      w.acc = 0
      w.lockUntil = now + 280
    },
  }

  // abrir el libro
  useEffect(() => {
    let cancelled = false
    let engine: ReaderEngine | null = null
    const callbacks: EngineCallbacks = {
      onRelocate(l) {
        setLoc(l)
        pending.current = l
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(saveNow, 800)
      },
      onTap: x => actions.current.tap(x),
      onKey: e => actions.current.key(e),
      onWheel: e => actions.current.wheel(e),
      onSwipe: dir => turn(dir),
    }
    ;(async () => {
      try {
        const record = await db.books.get(bookId)
        if (!record) throw new Error('Libro no encontrado')
        setBook(record)
        const [buffer, progress] = await Promise.all([platform.readFile(record.path), db.progress.get(bookId)])
        if (cancelled || !stageRef.current) return
        engine = record.format === 'epub' ? new EpubEngine(callbacks) : new PdfEngine(callbacks)
        engineRef.current = engine
        await engine.open(stageRef.current, new File([buffer], record.fileName), {
          location: progress?.location,
          settings: latest.current.settings,
          theme: latest.current.theme,
          view: latest.current.view,
        })
        if (cancelled) return
        setPageAspect(engine.pageAspect())
        setToc(engine.toc())
        setStatus('ready')
        hideTimer.current = setTimeout(() => setChrome(false), 2200)
      } catch (e) {
        console.error(e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(saveTimer.current)
      clearTimeout(hideTimer.current)
      saveNow()
      turnerRef.current?.cancel()
      engine?.destroy()
      engineRef.current = null
    }
  }, [bookId, saveNow, turn])

  useEffect(() => {
    engineRef.current?.apply(settings, theme, view)
  }, [settings, theme, view])

  // tamaño del lector, para decidir si se muestra como libro abierto
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
    })
    ro.observe(root)
    turnerRef.current = turnLayerRef.current ? new PageTurner(turnLayerRef.current) : null
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!settings.keepAwake) return
    platform.keepAwake(true)
    return () => {
      platform.keepAwake(false)
    }
  }, [settings.keepAwake])

  // el modo noche automático revisa la hora cada minuto
  useEffect(() => {
    if (!settings.autoNight) return
    const id = setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [settings.autoNight])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      actions.current.key(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // en PC las barras aparecen al mover el ratón y se esconden solas
  useEffect(() => {
    if (isTouchDevice) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onMove = (e: MouseEvent) => {
      const nearEdge = e.clientY < 110 || e.clientY > window.innerHeight - 110
      if (!nearEdge) return
      setChrome(true)
      clearTimeout(timer)
      timer = setTimeout(() => setChrome(false), 2500)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      clearTimeout(timer)
    }
  }, [])

  const fraction = scrub ?? loc?.fraction ?? 0
  const percent = Math.round(fraction * 100)
  const commitScrub = (e: { currentTarget: HTMLInputElement; type: string }) => {
    // al soltar, la barra suelta el foco: así las flechas vuelven a pasar página
    if (e.type === 'pointerup') e.currentTarget.blur()
    if (scrub === null) return
    engineRef.current?.goToFraction(scrub)
    setScrub(null)
  }

  const vars = {
    '--r-bg': theme.bg,
    '--r-fg': theme.fg,
    '--r-muted': theme.muted,
    '--r-surface': theme.surface,
    '--r-border': theme.border,
    '--r-link': theme.link,
    '--r-fill': `${fraction * 100}%`,
    ...(book && {
      '--desk-a': mix(book.palette.dark, theme.dark ? '#000000' : theme.bg, theme.dark ? 0.35 : 0.12),
      '--desk-b': mix(book.palette.dark, '#000000', 0.55),
    }),
  } as CSSProperties
  const stageStyle: CSSProperties | undefined = bookGeo
    ? { left: bookGeo.left, top: bookGeo.top, width: bookGeo.width, height: bookGeo.height, right: 'auto', bottom: 'auto', padding: 0 }
    : undefined

  const showChrome = chrome || panel !== null || status !== 'ready'

  return (
    <div ref={rootRef} className="reader" data-dark={theme.dark} data-chrome={showChrome} data-leaving={leaving} data-book={!!bookGeo} style={vars}>
      {bookGeo && book && <OpenBookBase geo={bookGeo} progress={fraction} palette={book.palette} theme={theme} />}
      <div className="reader-stage" ref={stageRef} style={stageStyle} />
      <div className="turn-layer" ref={turnLayerRef} aria-hidden />
      {bookGeo && <OpenBookGutter geo={bookGeo} progress={fraction} />}

      {status === 'loading' && (
        <div className="reader-status">
          <span className="spinner" />
          Abriendo…
        </div>
      )}
      {status === 'error' && (
        <div className="reader-status">
          <p>No se pudo abrir este libro.</p>
          <button className="reader-pill" onClick={back}>
            Volver a la biblioteca
          </button>
        </div>
      )}

      <header className="reader-bar top">
        <button className="reader-icon" onClick={back} aria-label="Volver a la biblioteca" title="Biblioteca (Esc)">
          <Icon name="back" />
        </button>
        <div className="reader-title">
          <strong>{book?.title}</strong>
          {loc?.chapter && <span>{loc.chapter}</span>}
        </div>
        <div className="reader-tools">
          <button className="reader-icon" onClick={() => setPanel(p => (p === 'toc' ? null : 'toc'))} aria-label="Índice" title="Índice">
            <Icon name="toc" />
          </button>
          <button className="reader-icon" onClick={() => setPanel(p => (p === 'comfort' ? null : 'comfort'))} aria-label="Ajustes de lectura" title="Ajustes de lectura">
            <Icon name="text" />
          </button>
          {!isTouchDevice && (
            <button className="reader-icon" onClick={() => platform.toggleFullscreen()} aria-label="Pantalla completa" title="Pantalla completa (F11)">
              <Icon name="fullscreen" />
            </button>
          )}
        </div>
      </header>

      <footer className="reader-bar bottom">
        <span className="reader-page">{loc?.pageLabel ?? loc?.chapter ?? ''}</span>
        <input
          className="reader-progress"
          type="range"
          min={0}
          max={1000}
          value={Math.round(fraction * 1000)}
          aria-label="Avance en el libro"
          onChange={e => setScrub(parseInt(e.target.value, 10) / 1000)}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
        />
        <span className="reader-percent">{percent}%</span>
      </footer>
      <div className="reader-mini-progress" aria-hidden />

      {panel === 'toc' && (
        <TocPanel
          toc={toc}
          current={loc?.chapter}
          onClose={() => setPanel(null)}
          onSelect={entry => {
            engineRef.current?.goTo(entry.target)
            setPanel(null)
          }}
        />
      )}
      {panel === 'comfort' && book && <ComfortPanel bookId={bookId} format={book.format} onClose={() => setPanel(null)} />}

      <div className="reader-dim" style={{ opacity: (1 - settings.brightness) * 0.9 }} aria-hidden />
      <div className="reader-warm" style={{ opacity: settings.warmth * 0.3 }} aria-hidden />
    </div>
  )
}
