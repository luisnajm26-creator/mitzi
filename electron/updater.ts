import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { UpdateInfo } from '../shared/native-api.js'
import { isReleaseFile } from './release.js'


const linux = process.platform === 'linux'

/**
 * Descarga el instalador nuevo (Windows) o el paquete .deb (Ubuntu), comprueba su huella
 * SHA-256 contra el SHA256SUMS.txt publicado y lo instala: reemplaza la app y la vuelve a abrir.
 */
export async function installUpdate(info: UpdateInfo, onProgress: (fraction: number) => void): Promise<'installing'> {
  if (!app.isPackaged) throw new Error('Las actualizaciones solo se instalan en la app instalada, no en desarrollo.')
  // en Ubuntu solo se actualiza la que se instaló con el paquete (vive en /opt/Mitzi)
  if (linux && !process.execPath.startsWith('/opt/Mitzi/'))
    throw new Error('Esta copia de Mitzi no se instaló con el paquete .deb: descarga la versión nueva de GitHub.')
  // solo archivos de las versiones publicadas de este repositorio
  const pattern = linux ? /^Mitzi-\d+\.\d+\.\d+\.deb$/ : /^Mitzi-Setup-\d+\.\d+\.\d+\.exe$/
  if (!pattern.test(info.name) || !isReleaseFile(info.url, info.name) || !isReleaseFile(info.sumsUrl, 'SHA256SUMS.txt'))
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
  if (linux) {
    await installDeb(file)
    // el paquete ya reemplazó los archivos en /opt/Mitzi: se abre la versión nueva
    app.relaunch()
    setTimeout(() => app.quit(), 300)
    return 'installing'
  }
  // el instalador de electron-builder: /S en silencio, --updated conserva accesos, --force-run la reabre
  spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 800)
  return 'installing'
}

/**
 * Instalar un .deb necesita permisos de administrador: pkexec muestra la ventana del sistema
 * que pide la contraseña (la misma de la Tienda de Ubuntu). Mitzi nunca ve la contraseña.
 */
function installDeb(file: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('pkexec', ['dpkg', '-i', file], { stdio: 'ignore' })
    child.on('error', () => reject(new Error('No se encontró pkexec para instalar el paquete. Descárgalo de GitHub e instálalo a mano.')))
    child.on('exit', code => {
      fs.rmSync(file, { force: true })
      if (code === 0) resolve()
      // 126: se cerró la ventana de la contraseña; 127: no se pudo autorizar
      else if (code === 126 || code === 127) reject(new Error('No se instaló: hace falta tu contraseña para actualizar.'))
      else reject(new Error(`No se pudo instalar el paquete (dpkg terminó con ${code}).`))
    })
  })
}
