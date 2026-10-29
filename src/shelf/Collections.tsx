import { useState } from 'react'
import { useBackHandler } from '../app/back'
import type { BookRecord } from '../library/db'
import { booksIn, createCollection, deleteCollection, hasBook, renameCollection, setInCollection, SUGGESTED, useCollections } from '../library/collections'
import { Icon } from '../ui/Icon'

/** Campo para crear una colección, con sugerencias de nombres que todavía no existen. */
function NewCollection({ onCreate }: { onCreate(name: string): void }) {
  const list = useCollections(s => s.list)
  const [name, setName] = useState('')
  const taken = new Set(list.map(c => c.name.toLowerCase()))
  const suggestions = SUGGESTED.filter(s => !taken.has(s.toLowerCase()))
  const submit = (value: string) => {
    if (!value.trim()) return
    onCreate(value)
    setName('')
  }
  return (
    <div className="collection-new">
      <form
        onSubmit={e => {
          e.preventDefault()
          submit(name)
        }}
      >
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nueva colección" maxLength={40} enterKeyHint="done" />
        <button className="read-button small" type="submit" disabled={!name.trim()}>
          Crear
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="collection-suggestions">
          {suggestions.map(s => (
            <button key={s} className="ghost-button small" onClick={() => submit(s)}>
              <Icon name="plus" size={14} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** En Configuración: crear, cambiar de nombre y borrar colecciones. */
export function CollectionsContent() {
  const list = useCollections(s => s.list)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState<string | null>(null)

  return (
    <>
      <p className="sheet-note">
        Junta tus libros como quieras. Para agregar uno, búscalo en la biblioteca y toca el botón de colección junto a «Leer». En el
        explorador puedes agruparlos por colección y verlas en el carrusel.
      </p>
      <ul className="folder-list">
        {list.map(c => (
          <li key={c.id}>
            {editing === c.id ? (
              <form
                className="collection-rename"
                onSubmit={e => {
                  e.preventDefault()
                  if (draft.trim()) renameCollection(c.id, draft)
                  setEditing(null)
                }}
              >
                <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus maxLength={40} />
                <button className="ghost-button small" type="submit">
                  Guardar
                </button>
              </form>
            ) : (
              <>
                <span className="collection-name">
                  <strong>{c.name}</strong>
                  <small>
                    {booksIn(c).length} {booksIn(c).length === 1 ? 'libro' : 'libros'}
                  </small>
                </span>
                <div className="folder-actions">
                  <button
                    className="ghost-button small"
                    onClick={() => {
                      setDraft(c.name)
                      setEditing(c.id)
                    }}
                  >
                    Renombrar
                  </button>
                  <button
                    className="ghost-button small settings-danger"
                    data-state={asking === c.id ? 'ask' : 'idle'}
                    onClick={() => {
                      if (asking === c.id) deleteCollection(c.id)
                      else setAsking(c.id)
                    }}
                    onBlur={() => setAsking(null)}
                  >
                    {asking === c.id ? '¿Borrar?' : 'Borrar'}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <NewCollection onCreate={name => createCollection(name)} />
    </>
  )
}

/** Desde la biblioteca: en qué colecciones está este libro. */
export function CollectionPicker({ book, onClose }: { book: BookRecord; onClose(): void }) {
  const list = useCollections(s => s.list)
  useBackHandler(true, onClose)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet collection-picker" onClick={e => e.stopPropagation()} role="dialog" aria-label="Colecciones de este libro">
        <header className="sheet-header">
          <h2>Guardar en una colección</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        <p className="sheet-note collection-book">{book.title}</p>
        {list.length > 0 && (
          <div className="collection-checks">
            {list.map(c => {
              const inside = hasBook(c, book.id)
              return (
                <button key={c.id} className="collection-check" data-on={inside} aria-pressed={inside} onClick={() => setInCollection(c.id, book.id, !inside)}>
                  <span className="collection-box">{inside && <Icon name="check" size={16} />}</span>
                  <span>{c.name}</span>
                  <small>{booksIn(c).length}</small>
                </button>
              )
            })}
          </div>
        )}
        <NewCollection onCreate={name => createCollection(name, [book.id])} />
      </div>
    </div>
  )
}
