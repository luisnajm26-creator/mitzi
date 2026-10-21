/**
 * Formatos que Mitzi abre. Todos salvo PDF los lee foliate-js: EPUB, Kindle (MOBI/AZW3),
 * FictionBook (FB2) y cómics (CBZ). Los Kindle con DRM no se pueden abrir.
 */
export const FORMAT_LABELS = {
  epub: 'EPUB',
  mobi: 'MOBI',
  azw3: 'AZW3',
  fb2: 'FB2',
  cbz: 'Cómic',
  pdf: 'PDF',
} as const

export type BookFormat = keyof typeof FORMAT_LABELS

const BY_EXTENSION: Record<string, BookFormat> = {
  epub: 'epub',
  pdf: 'pdf',
  mobi: 'mobi',
  azw: 'mobi',
  azw3: 'azw3',
  fb2: 'fb2',
  fbz: 'fb2',
  cbz: 'cbz',
}

export const formatOf = (name: string): BookFormat | null => BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''] ?? null

/** Texto que se puede reacomodar (letra, márgenes, libro abierto, hoja que gira). */
export const isReflowable = (format: BookFormat) => format !== 'pdf' && format !== 'cbz'
