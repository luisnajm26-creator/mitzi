/** Texto sin tildes ni mayúsculas, para buscar y agrupar. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()

/** "Re Zero [LN]" y "Re:Zero [LN]" son la misma serie: se comparan solo letras y números. */
export const seriesKeyOf = (name: string) => normalize(name).replace(/[^\p{L}\p{N}]+/gu, '')

const WITH_WORD =
  /^(.*?)[\s\-–—:,.]*[([]?\s*(?:vol(?:umen|ume)?\.?|v\.|tomo|libro|book|parte|part|#|n[º°o]\.?)\s*(\d{1,3}(?:[.,]\d+)?)\s*[)\]]?(?:\s*[-–—:.,]\s*.*|\s.*)?$/i
const TRAILING_NUMBER = /^(.*?\D)\s+(\d{1,3}(?:[.,]\d)?)\s*$/

/**
 * Deduce la serie y el número de tomo desde el título, cuando el libro no lo trae
 * en sus datos: "Re Zero [LN] - Vol 3" → Re Zero [LN] (3); "Re:Zero [LN] 13" → Re:Zero [LN] (13).
 * Un libro solo se agrupa si hay al menos otro de la misma serie, así que un título
 * como "Fahrenheit 451" no queda solo en una serie inventada.
 */
export function guessSeries(title: string): { series: string; index: number } | null {
  const m = title.match(WITH_WORD) ?? title.match(TRAILING_NUMBER)
  if (!m) return null
  const series = m[1].replace(/[\s\-–—:,.]+$/, '').trim()
  const index = parseFloat(m[2].replace(',', '.'))
  if (series.length < 2 || !Number.isFinite(index) || index > 200) return null
  return { series, index }
}
