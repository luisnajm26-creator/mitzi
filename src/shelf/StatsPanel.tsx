import { useEffect, useMemo, useState } from 'react'
import { useBackHandler } from '../app/back'
import { db, type BookRecord } from '../library/db'
import { flushStats } from '../library/stats'
import { calendar, favoriteTime, monthName, periodBars, summarize, type Bar, type Period, type StatsSummary } from '../library/statsSummary'
import { formatMinutes } from '../reader/pace'
import { useReaderSettings } from '../reader/comfort/settings'
import { Segment } from '../ui/controls'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Picker'
import { StatsShare } from './StatsShare'

const GOALS = [0, 10, 15, 20, 30, 45, 60].map(m => ({ value: String(m), label: m ? `${m} min al día` : 'Sin meta' }))
const PERIOD_NAME: Record<Period, string> = { semana: 'la semana pasada', mes: 'los 30 días anteriores', año: 'el año anterior' }
const CALENDAR_WEEKS = 20

/**
 * Barras de minutos, con el detalle de la que se toca (o se señala con el ratón) arriba.
 * Si hay meta diaria, una línea punteada marca hasta dónde llega.
 */
function Bars({ bars, goal }: { bars: Bar[]; goal: number }) {
  const [picked, setPicked] = useState<number | null>(null)
  const peak = Math.max(goal, ...bars.map(b => b.minutes), 1)
  const shown = picked !== null ? bars[picked] : null
  return (
    <div className="stats-chart">
      <div className="stats-readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{shown.minutes >= 1 ? formatMinutes(shown.minutes) : 'Sin lectura'}</strong> · {shown.detail}
          </>
        ) : (
          <span className="stats-readout-hint">Toca una barra para ver el detalle</span>
        )}
      </div>
      <div className="stats-bars" data-count={bars.length} onPointerLeave={() => setPicked(null)}>
        {goal > 0 && <span className="stats-goal-line" style={{ bottom: `calc(20px + (100% - 20px) * ${Math.min(1, goal / peak)})` }} title={`Meta: ${goal} min`} />}
        {bars.map((b, i) => (
          <button
            key={i}
            className="stats-col"
            data-current={b.current}
            data-picked={picked === i}
            onPointerEnter={e => e.pointerType === 'mouse' && setPicked(i)}
            onClick={() => setPicked(picked === i ? null : i)}
            aria-label={`${b.detail}: ${formatMinutes(b.minutes)}`}
          >
            <span className="stats-bar">
              <span style={{ height: `${(b.minutes / peak) * 100}%` }} data-empty={b.minutes < 0.5} />
            </span>
            <span className="stats-col-label">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Cuatro tonos del mismo color: más intenso cuanto más leíste ese día. */
const level = (minutes: number, goal: number) => {
  if (minutes < 1) return 0
  const full = goal > 0 ? goal : 30
  if (minutes < full * 0.34) return 1
  if (minutes < full * 0.67) return 2
  if (minutes < full) return 3
  return 4
}

/** Calendario de las últimas semanas, como el de las contribuciones de GitHub. */
function Calendar({ data, goal }: { data: StatsSummary; goal: number }) {
  const cells = useMemo(() => calendar(data.days, CALENDAR_WEEKS), [data])
  const [picked, setPicked] = useState<number | null>(null)
  const shown = picked !== null ? cells[picked] : null
  // el nombre del mes va arriba de la primera semana que lo trae
  const months = Array.from({ length: CALENDAR_WEEKS }, (_, w) => {
    const first = cells[w * 7]
    const prev = w > 0 ? cells[(w - 1) * 7] : null
    return !prev || prev.month !== first.month ? monthName(first.month) : ''
  })
  return (
    <div className="stats-calendar-wrap">
      <div className="stats-readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{shown.minutes >= 1 ? formatMinutes(shown.minutes) : 'Sin lectura'}</strong> · {shown.detail}
          </>
        ) : (
          <span className="stats-readout-hint">{data.daysRead} {data.daysRead === 1 ? 'día' : 'días'} con lectura en total</span>
        )}
      </div>
      <div className="stats-months" style={{ gridTemplateColumns: `repeat(${CALENDAR_WEEKS}, 1fr)` }} aria-hidden>
        {months.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
      <div className="stats-calendar" style={{ gridTemplateColumns: `repeat(${CALENDAR_WEEKS}, 1fr)` }} onPointerLeave={() => setPicked(null)}>
        {cells.map((c, i) => (
          <button
            key={c.key}
            className="stats-cell"
            data-level={c.future ? 'future' : level(c.minutes, goal)}
            data-picked={picked === i}
            disabled={c.future}
            onPointerEnter={e => e.pointerType === 'mouse' && setPicked(i)}
            onClick={() => setPicked(picked === i ? null : i)}
            aria-label={`${c.detail}: ${formatMinutes(c.minutes)}`}
          />
        ))}
      </div>
      <div className="stats-scale" aria-hidden>
        Menos
        {[0, 1, 2, 3, 4].map(l => (
          <span key={l} className="stats-cell" data-level={l} />
        ))}
        Más
      </div>
    </div>
  )
}

/** Minutos por hora del día: cuándo sueles leer. */
function Hours({ hours }: { hours: number[] }) {
  const peak = Math.max(...hours, 1)
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className="stats-chart">
      <div className="stats-readout" aria-live="polite">
        {picked !== null ? (
          <>
            <strong>{formatMinutes(hours[picked])}</strong> · de {picked}:00 a {picked + 1}:00
          </>
        ) : (
          <span className="stats-readout-hint">Toca una hora</span>
        )}
      </div>
      <div className="stats-bars hours" onPointerLeave={() => setPicked(null)}>
        {hours.map((m, h) => (
          <button
            key={h}
            className="stats-col"
            data-picked={picked === h}
            onPointerEnter={e => e.pointerType === 'mouse' && setPicked(h)}
            onClick={() => setPicked(picked === h ? null : h)}
            aria-label={`De ${h}:00 a ${h + 1}:00: ${formatMinutes(m)}`}
          >
            <span className="stats-bar">
              <span style={{ height: `${(m / peak) * 100}%` }} data-empty={m < 0.5} />
            </span>
            <span className="stats-col-label">{h % 6 === 0 ? `${h} h` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Portadas pequeñas para las listas (se liberan al cerrar). */
function useCovers(books: BookRecord[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const ids = books.map(b => b.id).join(',')
  useEffect(() => {
    let cancelled = false
    const made: string[] = []
    Promise.all(books.filter(b => b.hasCover).map(b => db.covers.get(b.id))).then(covers => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const c of covers) if (c) made.push((next[c.id] = URL.createObjectURL(c.blob)))
      setUrls(next)
    })
    return () => {
      cancelled = true
      made.forEach(u => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  return urls
}

function BookRow({ book, cover, children }: { book: BookRecord; cover?: string; children: React.ReactNode }) {
  return (
    <li className="stats-book">
      <span className="stats-cover" style={{ background: book.palette.primary }}>
        {cover && <img src={cover} alt="" draggable={false} />}
      </span>
      <span className="stats-book-text">
        <strong>{book.title}</strong>
        {children}
      </span>
    </li>
  )
}

function compare(total: number, previous: number, period: Period) {
  if (previous < 1) return total >= 1 ? `Nada en ${PERIOD_NAME[period]}` : null
  const change = Math.round(((total - previous) / previous) * 100)
  if (Math.abs(change) < 3) return `Igual que ${PERIOD_NAME[period]}`
  return `${change > 0 ? '+' : ''}${change} % que ${PERIOD_NAME[period]}`
}

/** Tu lectura: hoy, rachas, cuánto lees por semana, mes y año, cuándo lees y qué libros. */
export function StatsPanel({ onClose }: { onClose(): void }) {
  useBackHandler(true, onClose)
  const [data, setData] = useState<StatsSummary | null>(null)
  const [period, setPeriod] = useState<Period>('semana')
  const [sharing, setSharing] = useState(false)
  const goal = useReaderSettings(s => s.global.dailyGoal)
  const update = useReaderSettings(s => s.update)

  useEffect(() => {
    ;(async () => {
      await flushStats()
      const [rows, progress, books] = await Promise.all([db.readingDays.toArray(), db.progress.toArray(), db.books.toArray()])
      setData(summarize(rows, progress, books))
    })()
  }, [])

  const chart = useMemo(() => (data ? periodBars(data.days, period) : null), [data, period])
  const topCovers = useCovers(data?.topBooks.map(t => t.book) ?? [])
  const finishedCovers = useCovers(data?.finished.slice(0, 6).map(f => f.book) ?? [])
  const when = data ? favoriteTime(data.hours) : null
  const average = chart ? chart.total / chart.bars.length : 0
  const thisYear = data?.finished.filter(f => new Date(f.at).getFullYear() === new Date().getFullYear()).length ?? 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stats" onClick={e => e.stopPropagation()} role="dialog" aria-label="Tu lectura">
        <header className="sheet-header settings-header">
          <h2>Tu lectura</h2>
          {data && (
            <button className="ghost-button small stats-share" onClick={() => setSharing(true)}>
              <Icon name="share" size={16} /> Compartir
            </button>
          )}
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div className="stats-cards">
          <div className="stats-card">
            <span className="stats-label">Hoy</span>
            <strong>{formatMinutes(data?.today ?? 0)}</strong>
            {goal > 0 ? (
              <>
                <span className="stats-goal">
                  <span style={{ width: `${Math.min(100, ((data?.today ?? 0) / goal) * 100)}%` }} />
                </span>
                <span className="stats-sub">{(data?.today ?? 0) >= goal ? '¡Meta cumplida!' : `Meta: ${goal} min`}</span>
              </>
            ) : (
              <span className="stats-sub">Sin meta diaria</span>
            )}
          </div>
          <div className="stats-card">
            <span className="stats-label">
              <Icon name="flame" size={13} /> Racha
            </span>
            <strong>
              {data?.streak ?? 0} {data?.streak === 1 ? 'día' : 'días'}
            </strong>
            <span className="stats-sub">Mejor: {data?.bestStreak ?? 0}</span>
          </div>
          <div className="stats-card">
            <span className="stats-label">
              <Icon name="trophy" size={13} /> Terminados
            </span>
            <strong>{data?.finished.length ?? 0}</strong>
            <span className="stats-sub">{thisYear} este año</span>
          </div>
          <div className="stats-card">
            <span className="stats-label">
              <Icon name="clock" size={13} /> Ritmo
            </span>
            <strong>{data?.pagesPerHour ? Math.round(data.pagesPerHour) : '—'}</strong>
            <span className="stats-sub">páginas por hora</span>
          </div>
        </div>

        <section className="stats-section">
          <div className="stats-section-head">
            <h3>Minutos leyendo</h3>
            <Segment<Period>
              value={period}
              options={[
                { value: 'semana', label: 'Semana' },
                { value: 'mes', label: 'Mes' },
                { value: 'año', label: 'Año' },
              ]}
              onChange={setPeriod}
            />
          </div>
          {chart && (
            <>
              <p className="stats-period">
                <strong>{formatMinutes(chart.total)}</strong>
                <span>
                  {period === 'año' ? 'en 12 meses' : `en ${chart.bars.length} días`} · {formatMinutes(average)} {period === 'año' ? 'al mes' : 'al día'}
                </span>
                {compare(chart.total, chart.previous, period) && <span className="stats-compare">{compare(chart.total, chart.previous, period)}</span>}
              </p>
              <Bars bars={chart.bars} goal={period === 'año' ? 0 : goal} />
            </>
          )}
        </section>

        {data && (
          <section className="stats-section">
            <h3>Últimas {CALENDAR_WEEKS} semanas</h3>
            <Calendar data={data} goal={goal} />
          </section>
        )}

        {data && data.hours.some(m => m >= 1) && (
          <section className="stats-section">
            <h3>Cuándo lees</h3>
            {when && <p className="stats-period">Lees más {when}.</p>}
            <Hours hours={data.hours} />
          </section>
        )}

        {data && data.topBooks.length > 0 && (
          <section className="stats-section">
            <h3>Lo que más leíste</h3>
            <ol className="stats-books">
              {data.topBooks.map(t => (
                <BookRow key={t.book.id} book={t.book} cover={topCovers[t.book.id]}>
                  <small>
                    {formatMinutes(t.minutes)} · {Math.round(t.fraction * 100)} %
                  </small>
                  <span className="stats-meter">
                    <span style={{ width: `${(t.minutes / data.topBooks[0].minutes) * 100}%` }} />
                  </span>
                </BookRow>
              ))}
            </ol>
          </section>
        )}

        {data && data.finished.length > 0 && (
          <section className="stats-section">
            <h3>Terminados</h3>
            <ol className="stats-books">
              {data.finished.slice(0, 6).map(f => (
                <BookRow key={f.book.id} book={f.book} cover={finishedCovers[f.book.id]}>
                  <small>{new Date(f.at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</small>
                </BookRow>
              ))}
            </ol>
          </section>
        )}

        <div className="stats-totals">
          <span>
            <strong>{formatMinutes(data?.totalMinutes ?? 0)}</strong> leyendo en total
          </span>
          <span>
            <strong>{data?.totalPages ?? 0}</strong> páginas
          </span>
          <span>
            <strong>{data?.started ?? 0}</strong> {data?.started === 1 ? 'libro empezado' : 'libros empezados'}
          </span>
        </div>

        <div className="stats-goal-picker">
          <Picker label="Meta diaria" icon="check" value={String(goal)} options={GOALS} onChange={v => update({ dailyGoal: Number(v) })} />
        </div>
        {sharing && data && <StatsShare data={data} onClose={() => setSharing(false)} />}
        <p className="sheet-note">
          Cuenta el tiempo que pasas leyendo (sin pausas largas). Se guarda solo en tus dispositivos; si sincronizas, se suma lo de
          cada uno. «Lo que más leíste» y «Cuándo lees» empiezan a contarse desde la versión 0.3.
        </p>
      </div>
    </div>
  )
}
