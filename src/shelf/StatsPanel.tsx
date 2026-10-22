import { useEffect, useState } from 'react'
import { useBackHandler } from '../app/back'
import { db, type ReadingDay } from '../library/db'
import { dayKey, flushStats, streak } from '../library/stats'
import { formatMinutes } from '../reader/pace'
import { useReaderSettings } from '../reader/comfort/settings'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Picker'

const GOALS = [0, 10, 15, 20, 30, 45, 60].map(m => ({ value: String(m), label: m ? `${m} min al día` : 'Sin meta' }))
const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

interface Summary {
  days: Map<string, ReadingDay>
  totalMinutes: number
  totalPages: number
  finished: number
}

/** Cuánto lees: hoy, la racha de días, la última semana y los totales; y la meta diaria. */
export function StatsPanel({ onClose }: { onClose(): void }) {
  useBackHandler(true, onClose)
  const [data, setData] = useState<Summary | null>(null)
  const goal = useReaderSettings(s => s.global.dailyGoal)
  const update = useReaderSettings(s => s.update)

  useEffect(() => {
    ;(async () => {
      await flushStats()
      const [rows, progress] = await Promise.all([db.readingDays.toArray(), db.progress.toArray()])
      setData({
        days: new Map(rows.map(r => [r.day, r])),
        totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
        totalPages: rows.reduce((s, r) => s + r.pages, 0),
        finished: progress.filter(p => p.fraction >= 0.98).length,
      })
    })()
  }, [])

  const today = data?.days.get(dayKey())?.minutes ?? 0
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return { label: WEEKDAY[d.getDay()], minutes: data?.days.get(dayKey(d))?.minutes ?? 0, today: i === 6 }
  })
  const peak = Math.max(goal, ...week.map(w => w.minutes), 1)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stats" onClick={e => e.stopPropagation()} role="dialog" aria-label="Tu lectura">
        <header className="sheet-header">
          <h2>Tu lectura</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div className="stats-cards">
          <div className="stats-card">
            <span className="stats-label">Hoy</span>
            <strong>{formatMinutes(today)}</strong>
            {goal > 0 && (
              <>
                <span className="stats-goal">
                  <span style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
                </span>
                <span className="stats-sub">{today >= goal ? '¡Meta cumplida!' : `Meta: ${goal} min`}</span>
              </>
            )}
          </div>
          <div className="stats-card">
            <span className="stats-label">Racha</span>
            <strong>{data ? streak(data.days) : 0} días</strong>
            <span className="stats-sub">seguidos leyendo</span>
          </div>
        </div>

        <div className="stats-week" aria-label="Últimos 7 días">
          {week.map((w, i) => (
            <div key={i} className="stats-day" data-today={w.today}>
              <span className="stats-bar">
                <span style={{ height: `${(w.minutes / peak) * 100}%` }} title={formatMinutes(w.minutes)} />
              </span>
              <span>{w.label}</span>
            </div>
          ))}
        </div>

        <div className="stats-totals">
          <span>
            <strong>{formatMinutes(data?.totalMinutes ?? 0)}</strong> leyendo
          </span>
          <span>
            <strong>{data?.totalPages ?? 0}</strong> páginas
          </span>
          <span>
            <strong>{data?.finished ?? 0}</strong> {data?.finished === 1 ? 'libro terminado' : 'libros terminados'}
          </span>
        </div>

        <div className="stats-goal-picker">
          <Picker label="Meta diaria" icon="check" value={String(goal)} options={GOALS} onChange={v => update({ dailyGoal: Number(v) })} />
        </div>
        <p className="sheet-note">Cuenta el tiempo que pasas leyendo (sin pausas largas). Todo se guarda solo en este dispositivo.</p>
      </div>
    </div>
  )
}
