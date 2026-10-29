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

/**
 * Con qué se cifra: el código corto que muestra la PC (solo para vincular un equipo) o la llave
 * larga que se intercambian al vincularse (todas las veces siguientes, sin código).
 */
export type Secret = { code: string } | { key: string; from: string }

/**
 * Al vincular, la llave del vínculo no viaja: cada equipo crea un par de llaves de un solo uso
 * (Diffie-Hellman con curva P-256), se mandan solo la parte pública y cada uno calcula por su
 * lado el mismo secreto. Así, aunque alguien grabara la vinculación y algún día adivinara el
 * código, no podría sacar la llave. El código también entra en la cuenta: si alguien se metiera
 * en medio sin saberlo, los dos equipos terminarían con llaves distintas y no se entenderían.
 */
export async function newExchange() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])) as CryptoKeyPair
  const pub = toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  return { pair, pub }
}

/** La llave del vínculo (base64) a partir de mi par de llaves, la parte pública del otro y el código. */
export async function agreeKey(pair: CryptoKeyPair, otherPub: string, code: string) {
  const other = await crypto.subtle.importKey('raw', fromBase64(otherPub), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: other }, pair.privateKey, 256)
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
  const key = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(cleanCode(code)), info: new TextEncoder().encode('mitzi-vinculo-1') },
    base,
    256,
  )
  return toBase64(new Uint8Array(key))
}

const rawKeys = new Map<string, Promise<CryptoKey>>()
const keyOfRaw = (key: string) => {
  if (!rawKeys.has(key)) rawKeys.set(key, crypto.subtle.importKey('raw', fromBase64(key), 'AES-GCM', false, ['encrypt', 'decrypt']))
  return rawKeys.get(key)!
}

const cryptoKey = (secret: Secret) => ('code' in secret ? keyOf(secret.code) : keyOfRaw(secret.key))

export async function seal(secret: Secret, kind: Kind, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(kind) }, await cryptoKey(secret), plain)
  // v1: con el código; v2: con la llave del vínculo, y dice de quién viene para buscar su llave
  const head = 'code' in secret ? { v: 1 } : { v: 2, from: secret.from }
  return JSON.stringify({ ...head, iv: toBase64(iv), data: toBase64(new Uint8Array(sealed)) })
}

/** Qué clase de sobre es (sin abrirlo): para saber con qué llave abrirlo. */
export function peek(body: string): { v: number; from?: string } {
  const envelope = JSON.parse(body) as { v: number; from?: string }
  if (envelope.v !== 1 && envelope.v !== 2) throw new Error('Versión de sincronización distinta: actualiza Mitzi en los dos equipos')
  return envelope
}

/** Lanza un error si la llave no es la correcta (o alguien cambió los datos). */
export async function open<T>(secret: Secret, kind: Kind, body: string): Promise<T> {
  peek(body)
  const envelope = JSON.parse(body) as { iv: string; data: string }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: new TextEncoder().encode(kind) },
    await cryptoKey(secret),
    fromBase64(envelope.data),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
