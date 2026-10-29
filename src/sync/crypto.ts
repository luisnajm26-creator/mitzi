/**
 * Cifrado de la sincronización. Los datos viajan por tu Wi-Fi sin HTTPS (la PC no tiene un
 * certificado), así que se cifran con AES-GCM usando una llave que sale del código que muestra
 * la PC: quien no vio el código no puede leerlos ni mandar datos falsos (no pasan la verificación).
 */

/** Sin 0, O, 1 ni I, que se confunden al escribirlos. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODE_LENGTH = 8

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('')
}

/** El código como lo escribió la persona: sin espacios ni guiones, en mayúsculas. */
export const cleanCode = (text: string) => text.toUpperCase().replace(/[^0-9A-Z]/g, '')

/** Para mostrarlo: K7QM-3XPA */
export const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-')

/**
 * PBKDF2 con muchas vueltas: el código es corto, y así probar códigos al azar contra datos
 * capturados en la red tomaría muchísimo tiempo.
 */
async function keyFrom(code: string) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(cleanCode(code)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('mitzi-sincronizar-1'), iterations: 150_000 },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const keys = new Map<string, Promise<CryptoKey>>()
const keyOf = (code: string) => {
  const clean = cleanCode(code)
  if (!keys.has(clean)) keys.set(clean, keyFrom(clean))
  return keys.get(clean)!
}

function toBase64(bytes: Uint8Array) {
  let text = ''
  // por partes: String.fromCharCode con millones de argumentos revienta la pila
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

function fromBase64(text: string) {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** `kind` va dentro de lo cifrado: una respuesta no se puede reenviar como si fuera un pedido. */
type Kind = 'pedido' | 'respuesta'

export async function seal(code: string, kind: Kind, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(kind) }, await keyOf(code), plain)
  return JSON.stringify({ v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(sealed)) })
}

/** Lanza un error si el código no es el correcto (o alguien cambió los datos). */
export async function open<T>(code: string, kind: Kind, body: string): Promise<T> {
  const envelope = JSON.parse(body) as { v: number; iv: string; data: string }
  if (envelope.v !== 1) throw new Error('Versión de sincronización distinta: actualiza Mitzi en los dos equipos')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: new TextEncoder().encode(kind) },
    await keyOf(code),
    fromBase64(envelope.data),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
