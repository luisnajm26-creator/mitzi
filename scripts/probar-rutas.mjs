// Prueba del filtro de rutas del protocolo mitzi:// (electron/serve.ts) y de las direcciones del
// actualizador (electron/release.ts), sin abrir Electron.
// Uso: npm run build y luego  node scripts/probar-rutas.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appFile } from '../dist-electron/electron/serve.js'
import { isReleaseFile } from '../dist-electron/electron/release.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')

// como lo recibe el manejador: la URL ya analizada, con lo codificado sin decodificar
const cases = [
  ['mitzi://app/index.html', true],
  ['mitzi://app/assets/index.js', true],
  ['mitzi://app/sounds/hoja-1.ogg', true],
  ['mitzi://app/..%2Fdist-electron/electron/main.js', false],
  ['mitzi://app/%2E%2E%2Fdist-electron/electron/main.js', false],
  ['mitzi://app/..%5Cdist-electron%5Celectron%5Cmain.js', false],
  ['mitzi://app/..%2F..%2F..%2FWindows%2Fwin.ini', false],
  // la URL ya resuelve «%2e%2e/» (sin barra codificada) y queda dentro de dist: no existe, da 404
  ['mitzi://app/%2e%2e/package.json', true],
  ['mitzi://app/..%2Fdist', false],
  ['mitzi://app/', false],
  ['mitzi://app/%E0%A4%A', false],
  ['mitzi://app/index.html%00.png', false],
]

let failed = 0
for (const [url, allowed] of cases) {
  const file = appFile(distDir, new URL(url).pathname)
  const ok = !!file === allowed
  if (!ok) failed++
  console.log(`${ok ? 'bien ' : 'MAL  '} ${allowed ? 'acepta ' : 'rechaza'}  ${url}${file ? `  →  ${path.relative(root, file)}` : ''}`)
}
// direcciones del actualizador (electron/release.ts)
const base = 'https://github.com/luisnajm26-creator/mitzi/releases/download'
const releases = [
  [`${base}/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', true],
  [`${base}/v0.3.0/SHA256SUMS.txt`, 'SHA256SUMS.txt', true],
  [`${base}/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.4.0.exe', false],
  [`${base}/v0.3.0/../../../otro/repo/releases/download/v1.0.0/Mitzi-Setup-1.0.0.exe`, 'Mitzi-Setup-1.0.0.exe', false],
  [`${base}/v0.3.0/%2e%2e/%2e%2e/x/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  [`${base}/v0.3.0/..%2F..%2FMitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  [`http://github.com/luisnajm26-creator/mitzi/releases/download/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  [`https://github.com.malo.com/luisnajm26-creator/mitzi/releases/download/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  [`https://malo@github.com/luisnajm26-creator/mitzi/releases/download/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  [`https://github.com:8443/luisnajm26-creator/mitzi/releases/download/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  [`${base}/v0.3.0/Mitzi-Setup-0.3.0.exe?x=1`, 'Mitzi-Setup-0.3.0.exe', false],
  [`https://github.com/otro/mitzi/releases/download/v0.3.0/Mitzi-Setup-0.3.0.exe`, 'Mitzi-Setup-0.3.0.exe', false],
  ['no es una dirección', 'Mitzi-Setup-0.3.0.exe', false],
]
console.log('')
for (const [url, name, allowed] of releases) {
  const ok = isReleaseFile(url, name) === allowed
  if (!ok) failed++
  console.log(`${ok ? 'bien ' : 'MAL  '} ${allowed ? 'acepta ' : 'rechaza'}  ${url}  (${name})`)
}

console.log(failed ? `\n${failed} casos fallaron` : '\nTodos los casos se comportan como deben')
process.exit(failed ? 1 : 0)
