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
}

export interface OpenOptions {
  location?: string
  settings: ComfortSettings
  theme: ThemeColors
}

/** Lo mismo para EPUB y PDF: así la interfaz, el relieve, las notas y la voz no distinguen formato. */
export interface ReaderEngine {
  readonly format: 'epub' | 'pdf'
  open(container: HTMLElement, file: File, options: OpenOptions): Promise<void>
  apply(settings: ComfortSettings, theme: ThemeColors): void
  next(): Promise<void>
  prev(): Promise<void>
  goTo(target: string): Promise<void>
  goToFraction(fraction: number): Promise<void>
  toc(): TocEntry[]
  destroy(): void
}
