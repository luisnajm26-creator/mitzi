import type { BookRecord } from '../../library/db'
import { db } from '../../library/db'
import { decodeImage } from '../../library/metadata'
import type { ThemeColors } from '../comfort/contrast'
import type { FontId } from '../comfort/fonts'
import { cleanQuote, LONG_QUOTE_WORDS, renderCard } from './card'
import { ShareShell, slug } from './ShareShell'

interface Props {
  text: string
  book: BookRecord
  theme: ThemeColors
  fontId: FontId
  onClose(): void
}

/** Vista previa de la tarjeta de una cita, con diseño y formato a elegir, y cómo compartirla. */
export function ShareSheet({ text, book, theme, fontId, onClose }: Props) {
  const quote = cleanQuote(text)
  const long = quote.split(/\s+/).length > LONG_QUOTE_WORDS
  return (
    <ShareShell
      title="Compartir cita"
      fileName={`mitzi-${slug(book.title)}.png`}
      theme={theme}
      palette={book.palette}
      hasCover={!!book.hasCover}
      renderKey={`${quote}|${book.id}|${theme.bg}|${fontId}`}
      note={long && <p className="share-note">Las citas cortas lucen más: lo que no quepa se recorta con «…».</p>}
      onClose={onClose}
      render={async (design, prefs) => {
        let cover: Awaited<ReturnType<typeof decodeImage>> | null = null
        if (prefs.cover && book.hasCover) {
          const row = await db.covers.get(book.id)
          if (row) cover = await decodeImage(row.blob).catch(() => null)
        }
        const canvas = await renderCard({
          text: quote,
          title: book.title,
          author: book.author,
          colors: design.colors(theme, book.palette),
          format: prefs.format,
          fontId,
          cover: cover ?? undefined,
        })
        cover?.close()
        return canvas
      }}
    />
  )
}
