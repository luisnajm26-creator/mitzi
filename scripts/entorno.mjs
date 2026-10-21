// Busca las herramientas de Android en esta computadora (sin Android Studio) y la llave
// de firma de las versiones publicadas. Lo usan android.mjs, crear-llave.mjs y publicar.mjs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const win = process.platform === 'win32'

export function findJava() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME
  const base = win ? 'C:\\Program Files\\Microsoft' : '/usr/lib/jvm'
  const jdk = fs.existsSync(base) && fs.readdirSync(base).find(d => /jdk-?21/.test(d))
  if (jdk) return path.join(base, jdk)
  throw new Error('No encontré Java 21. Instálalo (por ejemplo, Microsoft OpenJDK 21) o define JAVA_HOME.')
}

export function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    win ? path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk') : null,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ]
  const sdk = candidates.find(p => p && fs.existsSync(p))
  if (!sdk) throw new Error('No encontré el Android SDK. Instálalo o define ANDROID_HOME.')
  return sdk
}

/** La llave vive fuera del repositorio: en ~/.mitzi/ (o donde diga MITZI_KEYSTORE_PROPERTIES). */
export const keyDir = path.join(os.homedir(), '.mitzi')
export const keyProperties = process.env.MITZI_KEYSTORE_PROPERTIES || path.join(keyDir, 'keystore.properties')

export const version = () => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
