import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatMinutes, paceFactor, resetPaceSession, trackPace } from './pace'
import { SearchPanel } from './SearchPanel'
import { playPaperSound, preparePaperSound } from './paperSound'
import { dayKey, flushStats, notePageTurn, startReadingSession, todayMinutes } from '../library/stats'
import { isReflowable } from '../library/formats'
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
import { bookColors, computeBookGeometry, OpenBookBase, OpenBookGutter } from './layouts/OpenBook'
import { PageFlip, type FlipContext } from './pageTurn/PageFlip'
import { TocPanel } from './TocPanel'
import { ReadAloudBar, useReadAloud } from './tts/ReadAloud'
import { ShareSheet } from './share/ShareSheet'
import { AnnotationPopover, NoteEditor, NotesPanel, SelectionMenu } from './annotations/Annotations'
import type { AnnotationRecord, BookmarkRecord, HighlightColor } from '../library/db'
import type { PointerInfo, TextSelection } from './engines/types'
import './reader.css'

/** Tiempo sin mover el ratón para esconder el cursor. */
const CURSOR_IDLE_MS = 2500

type Panel = null | 'toc' | 'comfort' | 'notes' | 'search'

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
  const flipUnderRef = useRef<HTMLDivElement>(null)
  const flipOverRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<PageFlip | null>(null)
  /** gesto de arrastre en curso sobre la página */
  const gesture = useRef<{ sx: number; sy: number; zone: number; type: string; active: boolean } | null>(null)
  const engineRef = useRef<ReaderEngine | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [pageAspect, setPageAspect] = useState(0.66)
  const [book, setBook] = useState<BookRecord | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loc, setLoc] = useState<ReaderLocation | null>(null)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  const lastLocation = useRef<string | null>(null)
  const [goalDone, setGoalDone] = useState<number | null>(null)
  /** este libro avanzó en otro equipo (llegó al sincronizar): se ofrece ir a esa página */
  const [elsewhere, setElsewhere] = useState<{ location: string; fraction: number } | null>(null)
  /** cuándo se guardó por última vez el avance desde aquí (para saber si el que llega es más nuevo) */
  const savedAt = useRef(0)
  /** ¿se cumplió la meta del día? Se celebra una sola vez por día. */
  const checkGoal = async () => {
    const goal = useReaderSettings.getState().global.dailyGoal
    if (!goal) return
    const key = `mitzi-meta-${dayKey()}`
    try {
      if (localStorage.getItem(key)) return
    } catch {
      return
    }
    if ((await todayMinutes()) < goal) return
    try {
      localStorage.setItem(key, '1')
    } catch {
      // no es grave
    }
    setGoalDone(goal)
    setTimeout(() => setGoalDone(null), 4500)
  }
  /** tamaño de letra mientras se pellizca (se aplica al soltar) */
  const [pinchSize, setPinchSize] = useState<number | null>(null)
  /** brillo mientras se desliza el borde izquierdo */
  const [brightnessPreview, setBrightnessPreview] = useState<number | null>(null)
  const brightnessGesture = useRef<{ y: number; start: number; value: number } | null>(null)
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [tapped, setTapped] = useState<{ id: string; rect: DOMRect } | null>(null)
  // en la PC el cursor se esconde tras unos segundos quieto, para que no distraiga al leer
  const [cursorIdle, setCursorIdle] = useState(false)
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wakeCursor = useCallback(() => {
    setCursorIdle(false)
    clearTimeout(cursorTimer.current)
    cursorTimer.current = setTimeout(() => setCursorIdle(true), CURSOR_IDLE_MS)
  }, [])
  /** texto de la cita que se está convirtiendo en tarjeta para compartir */
  const [sharing, setSharing] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [ttsOpen, setTtsOpen] = useState(false)
  const tts = useReadAloud({
    engine: useCallback(() => engineRef.current, []),
    lang: book?.language,
    rate: settings.ttsRate,
    voice: settings.ttsVoice,
  })
  const setSetting = useReaderSettings(s => s.update)
  const loadVoices = useCallback(() => tts.backend?.voices() ?? Promise.resolve([]), [tts.backend])
  const [scrub, setScrub] = useState<number | null>(null)

  const pending = useRef<ReaderLocation | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wheel = useRef({ acc: 0, lockUntil: 0 })
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // libro abierto de dos páginas en pantallas horizontales (si se lee por páginas)
  const bookGeo = useMemo(
    () =>
      book && settings.flow === 'paginated' && settings.spread === 'auto' && (isReflowable(book.format) || settings.pdfFit === 'page')
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
    savedAt.current = Date.now()
    await db.progress.put({ bookId, location: l.location, fraction: l.fraction, chapter: l.chapter, updatedAt: savedAt.current })
  }, [bookId])

  // si al sincronizar llegó un avance más nuevo de este libro (se leyó en otro equipo), se ofrece ir
  useEffect(() => {
    const onSynced = async (e: Event) => {
      const ids = (e as CustomEvent<{ progressIds: string[] }>).detail?.progressIds ?? []
      if (!ids.includes(bookId)) return
      const remote = await db.progress.get(bookId)
      if (!remote || remote.updatedAt <= savedAt.current || engineRef.current?.showing(remote.location)) return
      setElsewhere({ location: remote.location, fraction: remote.fraction })
    }
    window.addEventListener('mitzi:sincronizado', onSynced)
    return () => window.removeEventListener('mitzi:sincronizado', onSynced)
  }, [bookId])

  const back = useCallback(async () => {
    clearTimeout(saveTimer.current)
    await flushStats()
    await saveNow()
    await refreshLibrary()
    closeBook()
  }, [saveNow, closeBook])

  const flipContext = (): FlipContext | null => {
    const stage = stageRef.current
    if (!stage) return null
    return {
      book: latest.current.view.bookMode,
      stage: stage.getBoundingClientRect(),
      dark: latest.current.theme.dark,
      gutter: rootRef.current?.querySelector<HTMLElement>('.book-gutter'),
    }
  }

  /**
   * Frecuencia alta mientras se lee activamente; en reposo la pantalla vuelve a ahorrar.
   * Se pide al tocar (antes de que empiece el giro: cambiar de 60 a 120 Hz a mitad de
   * la animación la traba) y se mantiene unos segundos entre página y página.
   */
  const boostRefresh = useCallback(() => {
    platform.setHighRefresh?.(true)
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      if (!flipRef.current?.busy) platform.setHighRefresh?.(false)
    }, 4000)
  }, [])

  /** Pasa de página, con la hoja de papel si la animación está activada. */
  const turn = useCallback((dir: 1 | -1) => {
    const engine = engineRef.current
    const ctx = flipContext()
    if (!engine || !ctx) return
    if (!latest.current.settings.animatePages || !flipRef.current || !engine.canFlip()) {
      if (dir > 0) engine.next()
      else engine.prev()
      return
    }
    boostRefresh()
    flipRef.current.turn(engine, dir, ctx).finally(boostRefresh)
  }, [boostRefresh])

  /**
   * Arrastrar la hoja: con el ratón desde el borde de la página; con el dedo,
   * deslizando a un lado en cualquier parte. Al soltar termina de girar o vuelve.
   */
  const onPointer = (e: PointerInfo): boolean => {
    // el ratón se mueve dentro del libro (iframe): el cursor vuelve a verse
    if (e.pointerType === 'mouse') wakeCursor()
    // brillo: deslizar arriba o abajo desde el borde izquierdo (teléfono y tablet)
    if (e.pointerType === 'touch') {
      const b = brightnessGesture.current
      if (e.type === 'down' && e.x < 28 && !latest.current.panel) {
        brightnessGesture.current = { y: e.y, start: latest.current.settings.brightness, value: latest.current.settings.brightness }
        return true
      }
      if (b) {
        if (e.type === 'move') {
          b.value = Math.min(1, Math.max(0.3, b.start - (e.y - b.y) / (window.innerHeight * 0.6)))
          setBrightnessPreview(b.value)
        } else {
          brightnessGesture.current = null
          setBrightnessPreview(null)
          if (b.value !== b.start) useReaderSettings.getState().update({ brightness: b.value }, bookId)
        }
        return true
      }
    }
    const engine = engineRef.current
    const flip = flipRef.current
    const stage = stageRef.current?.getBoundingClientRect()
    if (!engine || !flip || !stage || !latest.current.settings.animatePages || !engine.canFlip()) return false
    const g = gesture.current
    if (e.type === 'down') {
      boostRefresh()
      if (latest.current.panel || flip.busy) return false
      const rel = (e.x - stage.left) / stage.width
      const zone = e.pointerType === 'mouse' ? (rel > 0.85 ? 1 : rel < 0.15 ? -1 : 0) : 2
      gesture.current = { sx: e.x, sy: e.y, zone, type: e.pointerType, active: false }
      // tomar la esquina con el ratón no debe empezar a seleccionar texto
      return e.pointerType === 'mouse' && zone !== 0
    }
    if (!g) return false
    if (e.type === 'move') {
      if (g.active) {
        flip.dragTo(e.x, e.y)
        return true
      }
      const dx = e.x - g.sx
      const dy = e.y - g.sy
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return false
      if (g.type === 'mouse' && (g.zone === 0 || Math.sign(dx) === g.zone)) return false
      const dir: 1 | -1 = g.type === 'mouse' ? (g.zone > 0 ? 1 : -1) : dx < 0 ? 1 : -1
      const ctx = flipContext()
      if (!ctx) return false
      g.active = true
      engine.clearSelection()
      setSelection(null)
      setChrome(false)
      boostRefresh()
      flip.beginDrag(engine, dir, ctx, g.sx, g.sy).then(boostRefresh)
      flip.dragTo(e.x, e.y)
      return true
    }
    // up / cancel
    gesture.current = null
    if (!g.active) return false
    flip.endDrag()
    return true
  }
  const onPointerRef = useRef(onPointer)
  onPointerRef.current = onPointer

  // acciones que llaman los motores; leen siempre el estado más reciente
  const actions = useRef({
    tap(_x: number) {},
    key(_e: KeyboardEvent) {},
    wheel(_e: WheelEvent) {},
  })
  actions.current = {
    tap(x) {
      if (tappedRef.current) {
        setTapped(null)
        return
      }
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
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') setPanel('search')
      else if (e.key === 'Escape') {
        if (tappedRef.current) setTapped(null)
        else if (latest.current.panel) setPanel(null)
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
        if (l.minutesLeft) trackPace(l.minutesLeft.total)
        // estadísticas: cada página nueva suma el tiempo leído (sin pausas largas)
        if (l.location !== lastLocation.current) {
          if (lastLocation.current) {
            notePageTurn(bookId)
            checkGoal()
          }
          lastLocation.current = l.location
        }
        setLoc(l)
        pending.current = l
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(saveNow, 800)
      },
      onTap: x => actions.current.tap(x),
      onKey: e => actions.current.key(e),
      onWheel: e => actions.current.wheel(e),
      onSwipe: dir => turn(dir),
      onPointer: e => onPointerRef.current(e),
      onPinch(scale, done) {
        const base = latest.current.settings.fontSize
        const size = Math.min(36, Math.max(12, Math.round(base * scale)))
        if (!done) return setPinchSize(size)
        setPinchSize(null)
        if (size !== base) useReaderSettings.getState().update({ fontSize: size }, bookId)
      },
      onSelect: sel => {
        setSelection(sel)
        if (sel) setTapped(null)
      },
      onAnnotationTap: (id, rect) => {
        setSelection(null)
        setTapped({ id, rect })
      },
    }
    ;(async () => {
      try {
        const record = await db.books.get(bookId)
        if (!record) throw new Error('Libro no encontrado')
        setBook(record)
        resetPaceSession()
        startReadingSession(bookId)
        const [blob, progress] = await Promise.all([platform.readBlob(record.path), db.progress.get(bookId)])
        savedAt.current = progress?.updatedAt ?? 0
        if (cancelled || !stageRef.current) return
        engine = record.format === 'pdf' ? new PdfEngine(callbacks) : new EpubEngine(callbacks)
        engineRef.current = engine
        await engine.open(stageRef.current, new File([blob], record.fileName), {
          location: progress?.location,
          settings: latest.current.settings,
          theme: latest.current.theme,
          view: latest.current.view,
        })
        if (cancelled) return
        setPageAspect(engine.pageAspect())
        setToc(engine.toc())
        const [saved, marks] = await Promise.all([
          db.annotations.where('bookId').equals(bookId).toArray(),
          db.bookmarks.where('bookId').equals(bookId).toArray(),
        ])
        if (cancelled) return
        setAnnotations(saved.filter(a => !a.deleted))
        setBookmarks(marks.filter(b => !b.deleted).sort((a, b) => a.fraction - b.fraction))
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
      gesture.current = null
      engine?.destroy()
      engineRef.current = null
    }
  }, [bookId, saveNow, turn])

  useEffect(() => {
    engineRef.current?.apply(settings, theme, view)
  }, [settings, theme, view])

  // subrayados: se redibujan al cambiar la lista o el tema (sus colores dependen del fondo)
  useEffect(() => {
    if (status === 'ready') engineRef.current?.setAnnotations(annotations, theme)
  }, [annotations, theme, status])

  const tappedRef = useRef(tapped)
  tappedRef.current = tapped

  // el cursor: lo despiertan los movimientos fuera del libro (barras, PDF); dentro del EPUB, onPointer.
  // Con un panel, un menú o una nota abiertos no se esconde: ahí se está usando el ratón
  useEffect(() => {
    window.addEventListener('mousemove', wakeCursor)
    wakeCursor()
    return () => {
      window.removeEventListener('mousemove', wakeCursor)
      clearTimeout(cursorTimer.current)
    }
  }, [wakeCursor])
  // sonido de hoja: se carga al abrir el lector para que el primer giro ya suene
  useEffect(() => {
    if (settings.pageSound) preparePaperSound()
  }, [settings.pageSound])

  const hideCursor = cursorIdle && !panel && !selection && !tapped && !sharing && !editing
  useEffect(() => {
    engineRef.current?.setCursorHidden?.(hideCursor)
  }, [hideCursor, status])

  // al abrir un panel se cierran los menús flotantes
  useEffect(() => {
    if (panel) {
      setTapped(null)
      setSelection(null)
    }
  }, [panel])

  const saveAnnotation = useCallback(async (record: AnnotationRecord) => {
    await db.annotations.put(record)
    setAnnotations(list => [...list.filter(a => a.id !== record.id), ...(record.deleted ? [] : [record])])
  }, [])

  const highlight = (color: HighlightColor, withNote = false) => {
    if (!selection) return
    const now = Date.now()
    const record: AnnotationRecord = {
      id: crypto.randomUUID(),
      bookId,
      anchor: selection.anchor,
      rects: selection.rects,
      color,
      text: selection.text,
      chapter: loc?.chapter,
      fraction: loc?.fraction ?? 0,
      createdAt: now,
      updatedAt: now,
    }
    saveAnnotation(record)
    engineRef.current?.clearSelection()
    setSelection(null)
    if (withNote) setEditing(record.id)
  }

  const updateAnnotation = (id: string, patch: Partial<AnnotationRecord>) => {
    const current = annotations.find(a => a.id === id)
    if (current) saveAnnotation({ ...current, ...patch, updatedAt: Date.now() })
  }

  const sortedAnnotations = useMemo(() => [...annotations].sort((a, b) => a.fraction - b.fraction), [annotations])
  const tappedAnnotation = tapped ? annotations.find(a => a.id === tapped.id) : undefined
  const editingAnnotation = editing ? annotations.find(a => a.id === editing) : undefined

  // tamaño del lector, para decidir si se muestra como libro abierto
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
    })
    ro.observe(root)
    if (flipUnderRef.current && flipOverRef.current) {
      const flip = new PageFlip(flipUnderRef.current, flipOverRef.current)
      // tras cada giro, las copias del capítulo se preparan para el siguiente
      flip.onStart = () => {
        if (latest.current.settings.pageSound) void playPaperSound()
      }
      flip.onFinish = turned => {
        // una vibración muy leve cuando la hoja cae (teléfono)
        if (turned && latest.current.settings.haptics) platform.haptic?.()
        engineRef.current?.prewarm(flip.slotsFor(latest.current.view.bookMode))
      }
      flipRef.current = flip
    }
    return () => ro.disconnect()
  }, [])

  // los márgenes de la página quedan fuera del documento del EPUB: ahí también se puede tomar la hoja
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !book || book.format === 'pdf') return
    const handle = (type: PointerInfo['type']) => (e: PointerEvent) => {
      const taken = onPointerRef.current({ type, x: e.clientX, y: e.clientY, pointerType: e.pointerType })
      if (type === 'down' && taken) {
        e.preventDefault()
        stage.setPointerCapture(e.pointerId)
      }
    }
    const down = handle('down')
    const move = handle('move')
    const up = handle('up')
    const cancel = handle('cancel')
    stage.addEventListener('pointerdown', down)
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerup', up)
    stage.addEventListener('pointercancel', cancel)
    return () => {
      stage.removeEventListener('pointerdown', down)
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerup', up)
      stage.removeEventListener('pointercancel', cancel)
    }
  }, [book?.format])

  // mientras se lee, se preparan las copias de la página con tiempo: el giro empieza al instante
  useEffect(() => {
    if (status !== 'ready' || !settings.animatePages) return
    const id = setTimeout(() => {
      const flip = flipRef.current
      if (flip && !flip.busy) engineRef.current?.prewarm(flip.slotsFor(latest.current.view.bookMode))
    }, 700)
    return () => clearTimeout(id)
  }, [loc, status, settings, theme, view, annotations])

  // pantalla encendida: si lo pide el ajuste o mientras se lee en voz alta
  const awake = settings.keepAwake || tts.state === 'playing'
  useEffect(() => {
    if (!awake) return
    platform.keepAwake(true)
    return () => {
      platform.keepAwake(false)
    }
  }, [awake])

  // en Android se lee a pantalla completa, sin barras del sistema
  useEffect(() => {
    platform.setImmersive?.(true)
    return () => {
      platform.setImmersive?.(false)
    }
  }, [])

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

  // marcador de la página que se ve (si hay)
  const currentBookmark = useMemo(
    () => (loc && status === 'ready' ? bookmarks.find(b => engineRef.current?.showing(b.location)) : undefined),
    [bookmarks, loc, status],
  )
  // se marca como borrado en vez de eliminarlo, para que el borrado también se sincronice
  const removeBookmark = (id: string) => db.bookmarks.update(id, { deleted: true, updatedAt: Date.now() })
  const toggleBookmark = () => {
    if (currentBookmark) {
      removeBookmark(currentBookmark.id)
      setBookmarks(list => list.filter(b => b.id !== currentBookmark.id))
      return
    }
    const here = engineRef.current?.bookmarkHere()
    if (!here || !loc) return
    const record: BookmarkRecord = {
      id: crypto.randomUUID(),
      bookId,
      location: here.location,
      fraction: loc.fraction,
      label: loc.chapter ?? loc.pageLabel,
      excerpt: here.excerpt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    db.bookmarks.put(record)
    setBookmarks(list => [...list, record].sort((a, b) => a.fraction - b.fraction))
  }

  const fraction = scrub ?? loc?.fraction ?? 0
  const percent = Math.round(fraction * 100)
  // «8 min de capítulo · 3 h del libro», al ritmo de quien lee
  const timeLeft = useMemo(() => {
    const left = loc?.minutesLeft
    if (!left || scrub !== null) return null
    const f = paceFactor()
    const parts = []
    if (left.section !== undefined && left.section > 0.2) parts.push(`${formatMinutes(left.section / f)} de capítulo`)
    parts.push(`${formatMinutes(left.total / f)} del libro`)
    return parts.join(' · ')
  }, [loc, scrub])
  const commitScrub = (e: { currentTarget: HTMLInputElement; type: string }) => {
    // al soltar, la barra suelta el foco: así las flechas vuelven a pasar página
    if (e.type === 'pointerup') e.currentTarget.blur()
    if (scrub === null) return
    engineRef.current?.goToFraction(scrub)
    setScrub(null)
  }

  const desk = book ? bookColors(book.palette, theme) : null
  const vars = {
    '--r-bg': theme.bg,
    '--r-fg': theme.fg,
    '--r-muted': theme.muted,
    '--r-surface': theme.surface,
    ...(book && { '--r-tint': book.palette.primary }),
    '--r-border': theme.border,
    '--r-link': theme.link,
    '--r-fill': `${fraction * 100}%`,
    ...(desk && { '--desk-a': desk.deskA, '--desk-b': desk.deskB }),
  } as CSSProperties
  const stageStyle: CSSProperties | undefined = bookGeo
    ? { left: bookGeo.left, top: bookGeo.top, width: bookGeo.width, height: bookGeo.height, right: 'auto', bottom: 'auto', padding: 0 }
    : undefined

  const showChrome = chrome || panel !== null || status !== 'ready'

  return (
    <div ref={rootRef} className="reader" data-dark={theme.dark} data-chrome={showChrome} data-leaving={leaving} data-book={!!bookGeo} data-cursor={hideCursor ? 'hidden' : undefined} style={vars}>
      {bookGeo && book && <OpenBookBase geo={bookGeo} progress={fraction} palette={book.palette} theme={theme} />}
      <div className="reader-stage" ref={stageRef} style={stageStyle} />
      <div className="flip-under" ref={flipUnderRef} aria-hidden />
      {bookGeo && <OpenBookGutter geo={bookGeo} progress={fraction} dark={theme.dark} />}
      {settings.paperTexture && book && isReflowable(book.format) && (
        <div
          className="paper-grain"
          aria-hidden
          style={bookGeo ? { left: bookGeo.left, top: bookGeo.top, width: bookGeo.width, height: bookGeo.height } : { inset: 0 }}
        />
      )}
      <div className="flip-over" ref={flipOverRef} aria-hidden />

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
          {tts.available && (
            <button
              className="reader-icon"
              onClick={() => {
                setTtsOpen(true)
                if (tts.state !== 'playing') tts.play()
              }}
              aria-label="Leer en voz alta"
              title="Leer en voz alta"
            >
              <Icon name="speaker" />
            </button>
          )}
          <button
            className="reader-icon"
            data-on={!!currentBookmark}
            onClick={toggleBookmark}
            aria-label={currentBookmark ? 'Quitar marcador' : 'Marcar esta página'}
            title={currentBookmark ? 'Quitar marcador' : 'Marcar esta página'}
          >
            <Icon name="bookmark" filled={!!currentBookmark} />
          </button>
          <button className="reader-icon" onClick={() => setPanel(p => (p === 'search' ? null : 'search'))} aria-label="Buscar en el libro" title="Buscar en el libro (Ctrl+F)">
            <Icon name="search" />
          </button>
          <button className="reader-icon" onClick={() => setPanel(p => (p === 'notes' ? null : 'notes'))} aria-label="Marcadores, subrayados y notas" title="Marcadores, subrayados y notas">
            <Icon name="notes" />
          </button>
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
        {timeLeft && <span className="reader-time">{timeLeft}</span>}
        <span className="reader-percent">{percent}%</span>
      </footer>
      <div className="reader-mini-progress" aria-hidden />

      {ttsOpen && tts.backend && (
        <ReadAloudBar
          state={tts.state}
          rate={settings.ttsRate}
          voice={settings.ttsVoice}
          lang={book?.language}
          sleepAt={tts.sleepAt}
          voices={loadVoices}
          onPlay={tts.play}
          onPause={tts.pause}
          onSkip={tts.skip}
          onStop={() => {
            tts.stop()
            setTtsOpen(false)
          }}
          onRate={ttsRate => setSetting({ ttsRate }, bookId)}
          onVoice={ttsVoice => setSetting({ ttsVoice }, bookId)}
          onSleep={minutes => tts.setSleepAt(minutes ? Date.now() + minutes * 60_000 : null)}
        />
      )}
      {selection && (
        <SelectionMenu
          rect={selection.rect}
          text={selection.text}
          theme={theme}
          onHighlight={c => highlight(c)}
          onNote={() => highlight('amarillo', true)}
          onShare={
            book
              ? () => {
                  setSharing(selection.text)
                  engineRef.current?.clearSelection()
                  setSelection(null)
                }
              : undefined
          }
        />
      )}
      {sharing && book && <ShareSheet text={sharing} book={book} theme={theme} fontId={settings.fontId} onClose={() => setSharing(null)} />}
      {tapped && tappedAnnotation && (
        <AnnotationPopover
          annotation={tappedAnnotation}
          rect={tapped.rect}
          theme={theme}
          onColor={color => updateAnnotation(tappedAnnotation.id, { color })}
          onEditNote={() => {
            setEditing(tappedAnnotation.id)
            setTapped(null)
          }}
          onDelete={() => {
            updateAnnotation(tappedAnnotation.id, { deleted: true })
            setTapped(null)
          }}
        />
      )}
      {editingAnnotation && (
        <NoteEditor
          annotation={editingAnnotation}
          onClose={() => setEditing(null)}
          onSave={note => {
            updateAnnotation(editingAnnotation.id, { note: note || undefined })
            setEditing(null)
          }}
        />
      )}
      {panel === 'notes' && book && (
        <NotesPanel
          title={book.title}
          author={book.author}
          annotations={sortedAnnotations}
          bookmarks={bookmarks}
          theme={theme}
          onClose={() => setPanel(null)}
          onGoBookmark={b => {
            engineRef.current?.goTo(b.location)
            setPanel(null)
          }}
          onDeleteBookmark={b => {
            removeBookmark(b.id)
            setBookmarks(list => list.filter(x => x.id !== b.id))
          }}
          onGo={a => {
            engineRef.current?.goTo(a.anchor)
            setPanel(null)
          }}
          onEdit={a => setEditing(a.id)}
          onDelete={a => updateAnnotation(a.id, { deleted: true })}
        />
      )}
      {panel === 'search' && (
        <SearchPanel
          engine={engineRef.current}
          onClose={() => setPanel(null)}
          onGo={r => {
            engineRef.current?.goTo(r.location)
            // en el teléfono el panel tapa el libro: se cierra para ver el resultado
            if (isTouchDevice) setPanel(null)
          }}
        />
      )}
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
      {panel === 'comfort' && book && <ComfortPanel bookId={bookId} format={isReflowable(book.format) ? 'epub' : 'pdf'} onClose={() => setPanel(null)} />}

      <div className="reader-dim" style={{ opacity: (1 - (brightnessPreview ?? settings.brightness)) * 0.9 }} aria-hidden />
      {elsewhere && (
        <div className="goal-toast elsewhere-toast" role="status">
          <span>Avanzaste en otro equipo ({Math.round(elsewhere.fraction * 100)} %)</span>
          <button
            onClick={() => {
              engineRef.current?.goTo(elsewhere.location)
              setElsewhere(null)
            }}
          >
            Ir allí
          </button>
          <button onClick={() => setElsewhere(null)} aria-label="Seguir aquí">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {goalDone !== null && (
        <div className="goal-toast" role="status">
          <Icon name="check" size={18} /> ¡Cumpliste tu meta de hoy! ({goalDone} min)
        </div>
      )}
      {pinchSize !== null && (
        <div className="gesture-bubble" role="status">
          <Icon name="text" size={18} /> {pinchSize} px
        </div>
      )}
      {brightnessPreview !== null && (
        <div className="gesture-bubble left" role="status">
          <Icon name="sun" size={18} /> {Math.round(brightnessPreview * 100)}%
        </div>
      )}
      <div className="reader-warm" style={{ opacity: settings.warmth * 0.3 }} aria-hidden />
    </div>
  )
}
