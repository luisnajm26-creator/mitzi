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

/**
 * Una columna (página) visible, "fotografiada" para la animación de pasar página.
 * `mount` la dibuja dentro de un contenedor; el contenido se copia al crear la captura,
 * así que se puede montar aunque el libro ya haya avanzado.
 */
export interface SnapColumn {
  rect: DOMRect
  mount(container: HTMLElement): Promise<void>
}

export interface Snapshot {
  columns: SnapColumn[]
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
  /** Captura lo visible, o null si este modo no admite la animación. */
  snapshot(): Promise<Snapshot | null>
  destroy(): void
}
