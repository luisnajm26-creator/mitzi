import { useEffect, useRef } from 'react'

/**
 * Lo que está abierto encima de todo (un menú, el explorador, un panel) se cierra
 * con el gesto "atrás" de Android o con Esc, en orden: primero lo último que se abrió.
 */
const stack: { current: () => void }[] = []

/** Mientras `active`, el gesto atrás llama a `onBack` (si no hay nada más nuevo encima). */
export function useBackHandler(active: boolean, onBack: () => void) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    const entry = { current: () => ref.current() }
    stack.push(entry)
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}

/** Cierra lo último que se abrió. Devuelve false si no había nada abierto. */
export function handleBack() {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.current()
  return true
}
