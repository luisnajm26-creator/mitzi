import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { UpdateInfo } from '../shared/native-api.js'

/** Solo se descargan archivos de las versiones publicadas de este repositorio. */
const ALLOWED = 'https://github.com/luisnajm26-creator/mitzi/releases/download/'

/**
 * Descarga el instalador nuevo, comprueba su huella SHA-256 contra el SHA256SUMS.txt
 * publicado y lo ejecuta en silencio: reemplaza la app y la vuelve a abrir.
 */
export async function installUpdate(info: UpdateInfo, onProgress: (fraction: number) => void): Promise<'installing'> {
  if (!app.isPackaged) throw new Error('Las actualizaciones solo se instalan en la app instalada, no en desarrollo.')
  if (!info.url.startsWith(ALLOWED) || !info.sumsUrl.startsWith(ALLOWED) || !/^Mitzi-Setup-\d+\.\d+\.\d+\.exe$/.test(info.name))
    throw new Error('Dirección de actualización no permitida.')

  const sums = await (await net.fetch(info.sumsUrl)).text()
  const expected = sums
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .find(parts => parts[1] === info.name)?.[0]
    ?.toLowerCase()
  if (!expected) throw new Error('La versión no trae la huella de su instalador.')

  const res = await net.fetch(info.url)
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar la actualización (${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const dir = path.join(os.tmpdir(), 'mitzi-actualizacion')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, info.name)
  const out = fs.createWriteStream(file)
  const hash = crypto.createHash('sha256')
  const reader = res.body.getReader()
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    hash.update(value)
    received += value.length
    if (!out.write(value)) await new Promise(resolve => out.once('drain', resolve))
    if (total) onProgress(received / total)
  }
  await new Promise(resolve => out.end(resolve))

  if (hash.digest('hex') !== expected) {
    fs.rmSync(file, { force: true })
    throw new Error('La descarga no coincide con la huella publicada: no se instaló.')
  }
  // el instalador de electron-builder: /S en silencio, --updated conserva accesos, --force-run la reabre
  spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 800)
  return 'installing'
}
