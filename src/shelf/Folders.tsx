import { useEffect, useState } from 'react'
import { platform } from '../platform'
import type { LibraryFolders } from '../platform/types'
import { syncLibrary } from '../library/scanner'

export function useFolders() {
  const [folders, setFolders] = useState<LibraryFolders | null>(null)
  const reload = () => platform.getFolders().then(setFolders).catch(() => setFolders({ folders: [], defaultFolder: null }))
  useEffect(() => {
    reload()
  }, [])
  return [folders, reload] as const
}

const label = (folder: string) => platform.folderLabel?.(folder) ?? folder

/** Agrega una carpeta y vuelve a revisar la biblioteca. */
export const addFolder = async () => {
  if (await platform.addFolder()) await syncLibrary()
}

/** Las carpetas que Mitzi revisa, para agregar o quitar (dentro de Configuración). */
export function FoldersContent() {
  const [folders, reload] = useFolders()
  return (
    <>
      <p className="sheet-note">Mitzi revisa estas carpetas (y sus subcarpetas) y muestra los libros que encuentre: EPUB, PDF, MOBI, AZW3, FB2 y CBZ.</p>
      <ul className="folder-list">
        {folders?.folders.map(folder => (
          <li key={folder}>
            <code>{label(folder)}</code>
            <div className="folder-actions">
              {platform.kind === 'electron' && (
                <button className="ghost-button small" onClick={() => platform.revealFolder(folder)}>
                  Abrir
                </button>
              )}
              {platform.canManageFolders && folder !== folders.defaultFolder && (
                <button className="ghost-button small" onClick={() => platform.removeFolder(folder).then(reload).then(() => syncLibrary())}>
                  Quitar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {platform.canManageFolders ? (
        <button className="read-button" onClick={() => addFolder().then(reload)}>
          Agregar carpeta
        </button>
      ) : (
        <p className="sheet-note">En el navegador de desarrollo se usa la carpeta libros-prueba del proyecto.</p>
      )}
    </>
  )
}
