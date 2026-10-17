import { useEffect, useRef } from 'react'
import { Icon } from '../ui/Icon'
import type { TocEntry } from './engines/types'

interface Props {
  toc: TocEntry[]
  current?: string
  onSelect(entry: TocEntry): void
  onClose(): void
}

export function TocPanel({ toc, current, onSelect, onClose }: Props) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    list.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <aside className="reader-panel toc-panel" role="dialog" aria-label="Índice">
      <header className="panel-header">
        <h2>Índice</h2>
        <button className="panel-close" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>
      {toc.length === 0 ? (
        <p className="panel-hint">Este libro no trae índice.</p>
      ) : (
        <ol className="toc-list" ref={list}>
          {toc.map((entry, i) => (
            <li key={`${entry.target}-${i}`}>
              <button
                style={{ paddingLeft: 14 + entry.depth * 16 }}
                data-current={entry.label === current}
                onClick={() => onSelect(entry)}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
