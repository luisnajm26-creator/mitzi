import { lazy, Suspense, useEffect } from 'react'
import { platform } from '../platform'
import { syncLibrary } from '../library/scanner'
import { refreshLibrary } from '../library/store'
import { Shelf } from '../shelf/Shelf'
import { handleBack } from './back'
import { splashGone } from './splash'
import { useApp } from './store'

const Reader = lazy(() => import('../reader/Reader'))

export function App() {
  const view = useApp(s => s.view)
  const leaving = useApp(s => s.leaving)

  useEffect(() => {
    // primero se muestra lo que ya se conoce; revisar las carpetas (lo pesado) espera a que
    // termine la pantalla de inicio, y luego se deja listo el lector para abrir libros al instante
    refreshLibrary()
      .then(() => splashGone)
      .then(() => {
        syncLibrary()
        const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200))
        idle(() => void import('../reader/Reader'))
      })
    const offLibrary = platform.onLibraryChanged(() => syncLibrary())
    // al volver a la app (p. ej. después de copiar libros) se revisan las carpetas
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncLibrary()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      offLibrary()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        platform.toggleFullscreen()
      }
    }
    // arrastrar libros a la ventana los copia a la carpeta principal
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const files = [...(e.dataTransfer?.files ?? [])].filter(f => /\.(epub|pdf)$/i.test(f.name))
      if (files.length) platform.importDropped(files)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    // gesto "atrás" de Android: primero cierra lo que esté abierto (un menú, el explorador,
    // un panel); en el lector actúa como Esc; en la biblioteca, sin nada abierto, sale de la app
    const offBack = platform.onBackButton?.(() => {
      if (handleBack()) return
      if (useApp.getState().view.name === 'reader') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      else platform.exitApp?.()
    })
    return () => {
      offBack?.()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <>
      <Shelf active={view.name === 'shelf' || leaving} />
      {view.name === 'reader' && (
        <Suspense fallback={null}>
          <Reader key={view.bookId} bookId={view.bookId} />
        </Suspense>
      )}
    </>
  )
}
