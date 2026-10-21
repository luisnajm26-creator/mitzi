import type { AnnotationRecord } from '../../library/db'
import type { ThemeColors } from '../comfort/contrast'
import type { ComfortSettings } from '../comfort/settings'

export interface TocEntry {
  label: string
  /** href (EPUB) o "page:N" (PDF) */
  target: string
  depth: number
}

export interface ReaderLocation {
  /** 0–1 en todo el libro */
  fraction: number
  /** CFI (EPUB) o número de página (PDF), para retomar la lectura */
  location: string
  chapter?: string
  pageLabel?: string
  /** minutos que faltan al ritmo estándar (se ajustan al ritmo de quien lee en pace.ts) */
  minutesLeft?: { section?: number; total: number }
}

/** Un resultado de búsqueda dentro del libro. */
export interface SearchResult {
  /** CFI (EPUB) o número de página (PDF), para ir ahí */
  location: string
  excerpt: { pre: string; match: string; post: string }
  chapter?: string
}

/** Texto seleccionado, listo para subrayar. */
export interface TextSelection {
  text: string
  /** dónde está en la ventana (para poner el menú encima) */
  rect: DOMRect
  anchor: string
  rects?: AnnotationRecord['rects']
}

export interface EngineCallbacks {
  onRelocate(location: ReaderLocation): void
  /** Toque o clic sobre el texto, en coordenadas de la ventana. */
  onTap(x: number, y: number): void
  onKey(e: KeyboardEvent): void
  /** Rueda del ratón sobre el texto (solo importa en modo páginas). */
  onWheel(e: WheelEvent): void
  /** Deslizar a un lado en pantallas táctiles (cuando el motor no lo maneja solo). */
  onSwipe(dir: 1 | -1): void
  /** Se seleccionó texto (o se quitó la selección: null). */
  onSelect(selection: TextSelection | null): void
  /** Se tocó un subrayado existente. */
  onAnnotationTap(id: string, rect: DOMRect): void
  /**
   * Gestos sobre el texto. Devuelve true si Mitzi toma el gesto (arrastrar la hoja):
   * entonces el motor no hace su propio desplazamiento ni selecciona texto.
   */
  onPointer(e: PointerInfo): boolean
  /** Pellizco con dos dedos: `scale` respecto al comienzo; `done` al soltar. */
  onPinch?(scale: number, done: boolean): void
}

/** Cómo se muestra el libro: en PC/tablet horizontal, como libro abierto de dos páginas. */
export interface ViewOptions {
  bookMode: boolean
  /** Ancho de cada página en modo libro (px). */
  pageWidth: number
}

export interface OpenOptions {
  location?: string
  settings: ComfortSettings
  theme: ThemeColors
  view: ViewOptions
}

/** Qué página del libro abierto (o la única, en pantallas angostas). */
export type PageSide = 'left' | 'right' | 'single'

/** Toque, clic o arrastre sobre el libro, en coordenadas de la ventana. */
export interface PointerInfo {
  type: 'down' | 'move' | 'up' | 'cancel'
  x: number
  y: number
  pointerType: string
}

export interface SpeechSegment {
  text: string
  lang?: string
}

/** Lectura en voz alta: entrega el texto oración por oración, desde lo que se ve. */
export interface SpeechSource {
  next(): Promise<SpeechSegment | null>
  prev(): Promise<SpeechSegment | null>
  stop(): void
}

/** Lo mismo para EPUB y PDF: así la interfaz, el relieve, las notas y la voz no distinguen formato. */
export interface ReaderEngine {
  readonly format: 'epub' | 'pdf'
  open(container: HTMLElement, file: File, options: OpenOptions): Promise<void>
  apply(settings: ComfortSettings, theme: ThemeColors, view: ViewOptions): void
  next(): Promise<void>
  prev(): Promise<void>
  goTo(target: string): Promise<void>
  goToFraction(fraction: number): Promise<void>
  toc(): TocEntry[]
  /** Identificador de la posición actual (cambia al pasar de página). */
  position(): string | null
  /** Ancho / alto de una página, para dar forma al libro abierto. */
  pageAspect(): number
  /** Si en el estado actual se puede animar el giro de página (no al leer deslizando). */
  canFlip(): boolean
  /**
   * Dibuja dentro de `slot` una copia exacta de lo que se ve ahora en esa página
   * (`pageRect` es la hoja completa en la ventana). Devuelve false si esa página está vacía.
   */
  paintPage(slot: HTMLElement, side: PageSide, pageRect: DOMRect): Promise<boolean>
  /** Prepara las copias con tiempo, mientras se lee, para que el giro empiece al instante. */
  prewarm(slots: HTMLElement[]): void
  /** Dibuja los subrayados del libro (se llama de nuevo cuando cambian). */
  setAnnotations(list: AnnotationRecord[], theme: ThemeColors): void
  clearSelection(): void
  /** Dónde empieza lo que se ve ahora (para un marcador) y un fragmento de su texto. */
  bookmarkHere(): { location: string; excerpt: string } | null
  /** ¿Esa posición guardada está en lo que se ve ahora? */
  showing(location: string): boolean
  /** Busca en todo el libro y entrega los resultados a medida que los encuentra. */
  search(query: string, onResults: (results: SearchResult[]) => void, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void>
  clearSearch(): void
  /** Empieza a leer en voz alta desde la página visible. */
  speech(lang?: string): Promise<SpeechSource | null>
  destroy(): void
}
