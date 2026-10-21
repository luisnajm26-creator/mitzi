import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import type { ReaderEngine, SearchResult } from './engines/types'

interface Props {
  engine: ReaderEngine | null
  onGo(result: SearchResult): void
  onClose(): void
}

/** Buscar una palabra o frase en todo el libro (sin distinguir mayúsculas ni tildes). */
export function SearchPanel({ engine, onGo, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const run = useRef<AbortController | null>(null)

  useEffect(() => {
    // en el teléfono el teclado tapa media pantalla: solo se enfoca solo en PC
    if (matchMedia('(pointer: fine)').matches) input.current?.focus()
    return () => {
      run.current?.abort()
      engine?.clearSearch()
    }
  }, [engine])

  // se busca al dejar de escribir
  useEffect(() => {
    const id = setTimeout(() => {
      run.current?.abort()
      engine?.clearSearch()
      setResults([])
      const q = query.trim()
      if (!engine || q.length < 2) {
        setProgress(null)
        return
      }
      const ctrl = new AbortController()
      run.current = ctrl
      setProgress(0)
      engine
        .search(q, found => !ctrl.signal.aborted && setResults(prev => [...prev, ...found]), f => !ctrl.signal.aborted && setProgress(f), ctrl.signal)
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setProgress(null))
    }, 350)
    return () => clearTimeout(id)
  }, [query, engine])

  const status =
    query.trim().length < 2
      ? 'Escribe al menos dos letras.'
      : progress !== null
        ? `Buscando… ${Math.round(progress * 100)}%${results.length ? ` · ${results.length} encontrados` : ''}`
        : results.length
          ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`
          : 'No aparece en el libro.'

  return (
    <aside className="reader-panel search-panel" role="dialog" aria-label="Buscar en el libro">
      <header className="panel-header">
        <h2>Buscar en el libro</h2>
        <button className="panel-close" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>
      <div className="search-field">
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Una palabra o una frase"
          aria-label="Buscar en el libro"
          enterKeyHint="search"
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
      </div>
      <p className="panel-hint">{status}</p>
      <ol className="search-results">
        {results.map((r, i) => (
          <li key={`${r.location}-${i}`}>
            <button onClick={() => onGo(r)}>
              {r.chapter && <span className="note-chapter">{r.chapter}</span>}
              <span className="search-excerpt">
                {r.excerpt.pre}
                <mark>{r.excerpt.match}</mark>
                {r.excerpt.post}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
