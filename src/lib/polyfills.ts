/**
 * Funciones de JavaScript recientes que usan foliate-js y la app. Los teléfonos sin
 * servicios de Google (como los Huawei) traen un navegador interno propio que puede
 * ser varias versiones más viejo que Chrome; sin esto, ningún EPUB se podía leer.
 * Cada una se agrega solo si falta.
 */

type Key = PropertyKey

function define(target: object, name: string, value: unknown) {
  if (name in target) return
  Object.defineProperty(target, name, { value, writable: true, configurable: true })
}

// Chrome 117: foliate las usa al leer los datos de cada EPUB
define(Object, 'groupBy', function groupBy<T>(items: Iterable<T>, key: (item: T, index: number) => Key) {
  const out: Record<Key, T[]> = Object.create(null)
  let i = 0
  for (const item of items) (out[key(item, i++)] ??= []).push(item)
  return out
})

define(Map, 'groupBy', function groupBy<T>(items: Iterable<T>, key: (item: T, index: number) => unknown) {
  const out = new Map<unknown, T[]>()
  let i = 0
  for (const item of items) {
    const k = key(item, i++)
    const group = out.get(k)
    if (group) group.push(item)
    else out.set(k, [item])
  }
  return out
})

// Chrome 119
define(Promise, 'withResolvers', function withResolvers<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
})

// Chrome 97
define(Array.prototype, 'findLast', function findLast<T>(this: T[], test: (item: T, index: number, array: T[]) => unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (test(this[i], i, this)) return this[i]
  return undefined
})

define(Array.prototype, 'findLastIndex', function findLastIndex<T>(this: T[], test: (item: T, index: number, array: T[]) => unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (test(this[i], i, this)) return i
  return -1
})
