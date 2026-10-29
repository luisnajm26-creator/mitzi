import { useMemo, useState } from 'react'
import { db } from '../library/db'
import { decodeImage } from '../library/metadata'
import type { Palette } from '../library/palette'
import { shareStats, type StatsSummary } from '../library/statsSummary'
import { effectiveSettings, effectiveTheme, useReaderSettings } from '../reader/comfort/settings'
import { ShareShell } from '../reader/share/ShareShell'
import { renderStatsCard } from '../reader/share/statsCard'

/** Lavanda de Mitzi, para cuando no hay un libro más leído del que tomar colores. */
const MITZI_PALETTE: Palette = { primary: '#9d84e8', secondary: '#e8b884', dark: '#2a2140', light: '#efe6ff' }

/** Compartir «Tu lectura» como imagen: la semana o el mes, con los diseños de las citas. */
export function StatsShare({ data, onClose }: { data: StatsSummary; onClose(): void }) {
  const [kind, setKind] = useState<'semana' | 'mes'>('semana')
  const settings = useReaderSettings()
  const theme = effectiveTheme(settings)
  const { fontId, dailyGoal } = effectiveSettings(settings)
  const stats = useMemo(() => shareStats(data, kind, dailyGoal), [data, kind, dailyGoal])
  const top = stats.topBook?.book
  const palette = top?.palette ?? MITZI_PALETTE

  return (
    <ShareShell
      title="Compartir tu lectura"
      fileName={`mitzi-${kind === 'semana' ? 'mi-semana' : 'mi-mes'}.png`}
      theme={theme}
      palette={palette}
      hasCover={!!top?.hasCover}
      appColors
      renderKey={`${kind}|${theme.bg}|${fontId}|${dailyGoal}`}
      onClose={onClose}
      note={
        stats.totalMinutes < 1 && (
          <p className="share-note">Todavía no hay lectura en este periodo: la tarjeta saldrá en cero.</p>
        )
      }
      render={async (design, prefs) => {
        let cover: Awaited<ReturnType<typeof decodeImage>> | null = null
        // la portada solo va en la historia, junto al libro que más leíste
        if (prefs.cover && prefs.format === 'historia' && top?.hasCover) {
          const row = await db.covers.get(top.id)
          if (row) cover = await decodeImage(row.blob).catch(() => null)
        }
        const canvas = await renderStatsCard({
          stats,
          colors: design.colors(theme, palette),
          format: prefs.format,
          fontId,
          cover: cover ?? undefined,
        })
        cover?.close()
        return canvas
      }}
    >
      <span className="share-label">Qué compartir</span>
      <div className="segment-buttons">
        <button data-on={kind === 'semana'} onClick={() => setKind('semana')}>
          Mi semana
        </button>
        <button data-on={kind === 'mes'} onClick={() => setKind('mes')}>
          Mi mes
        </button>
      </div>
    </ShareShell>
  )
}
