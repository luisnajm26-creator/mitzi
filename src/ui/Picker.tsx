import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useBackHandler } from '../app/back'
import { isTouchDevice } from '../platform'
import { Icon, type IconName } from './Icon'
import './picker.css'

export interface PickerOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  label: string
  icon: IconName
  value: T
  options: PickerOption<T>[]
  onChange(value: T): void
}

/**
 * Selector con el estilo de la app (en vez del menú nativo del sistema): en el
 * teléfono abre una hoja desde abajo con opciones grandes; en PC, un menú bajo el botón.
 */
export function Picker<T extends string>({ label, icon, value, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  const button = useRef<HTMLButtonElement>(null)
  const sheet = isTouchDevice || window.innerWidth < 640
  const current = options.find(o => o.value === value)
  useBackHandler(open, () => setOpen(false))

  useLayoutEffect(() => {
    if (!open || sheet || !button.current) return
    const r = button.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 248))
    // si abajo no cabe (el botón está al final de un panel), el menú se abre hacia arriba
    const height = options.length * 44 + 16
    const below = window.innerHeight - r.bottom - 8 >= height || r.top < height
    setPos(below ? { left, top: r.bottom + 6, minWidth: Math.max(220, r.width) } : { left, bottom: window.innerHeight - r.top + 6, minWidth: Math.max(220, r.width) })
  }, [open, sheet, options.length])

  const pick = (v: T) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <>
      <button ref={button} className="picker-button" data-open={open} onClick={() => setOpen(true)} aria-haspopup="listbox" aria-expanded={open}>
        <Icon name={icon} size={17} />
        <span className="picker-text">
          <span className="picker-label">{label}</span>
          <span className="picker-value">{current?.label}</span>
        </span>
        <Icon name="chevron-down" size={15} />
      </button>
      {open &&
        createPortal(
          <div className="picker-backdrop" data-sheet={sheet} onClick={() => setOpen(false)}>
            <div className="picker-menu" data-sheet={sheet} style={sheet ? undefined : pos} role="listbox" aria-label={label} onClick={e => e.stopPropagation()}>
              {sheet && <div className="picker-grip" />}
              {sheet && <h3 className="picker-title">{label}</h3>}
              {options.map(o => (
                <button key={o.value} role="option" aria-selected={o.value === value} className="picker-option" data-on={o.value === value} onClick={() => pick(o.value)}>
                  <span>{o.label}</span>
                  {o.value === value && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
