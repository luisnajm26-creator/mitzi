import type { CSSProperties, ReactNode } from 'react'
import './controls.css'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange(v: number): void
}

export function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="control slider">
      <span className="control-label">
        {label}
        <span className="control-value">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </label>
  )
}

export function Stepper({ label, value, min, max, step, onChange }: Omit<SliderProps, 'format'>) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  return (
    <div className="control stepper">
      <span className="control-label">{label}</span>
      <div className="stepper-buttons">
        <button onClick={() => set(value - step)} disabled={value <= min} aria-label={`${label}: menos`}>
          A−
        </button>
        <span className="control-value">{value}</span>
        <button onClick={() => set(value + step)} disabled={value >= max} aria-label={`${label}: más`}>
          A+
        </button>
      </div>
    </div>
  )
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="control toggle">
      <span className="control-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
    </label>
  )
}

interface SegmentProps<T extends string | number | null> {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange(v: T): void
}

export function Segment<T extends string | number | null>({ label, value, options, onChange }: SegmentProps<T>) {
  return (
    <div className="control segment">
      {label && <span className="control-label">{label}</span>}
      <div className="segment-buttons" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button key={String(o.value)} role="radio" aria-checked={o.value === value} data-on={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
