// Prepara una versión de Mitzi para publicarla en GitHub Releases:
//   1. el instalador de Windows   release/Mitzi-Setup-x.y.z.exe
//   2. el APK firmado             release/Mitzi-x.y.z.apk
//   3. SHA256SUMS.txt             la huella de cada archivo: la app la comprueba antes de
//                                 instalar una actualización (si no coincide, no instala)
//
// Uso:
//   npm version patch          sube el número (patch = arreglos, minor = novedades, major = cambios grandes)
//   npm run publicar           arma los archivos en release/
//   npm run publicar -- --subir   además crea la versión en GitHub (queda pública) con `gh`
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { keyProperties, root, version } from './entorno.mjs'

const run = cmd => execSync(cmd, { stdio: 'inherit', cwd: root })
const v = version()
const dir = path.join(root, 'release')

if (!fs.existsSync(keyProperties)) {
  console.error('\nFalta tu llave de firma de Android. Créala una sola vez con:  npm run llave\n')
  process.exit(1)
}

run('npm run instalador')
run('node scripts/android.mjs --release')

const files = [`Mitzi-Setup-${v}.exe`, `Mitzi-${v}.apk`]
for (const f of files) if (!fs.existsSync(path.join(dir, f))) throw new Error(`No se generó ${f}`)
const sums = files.map(f => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')}  ${f}`)
fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), sums.join('\n') + '\n')

console.log(`\nVersión ${v} lista en release/:\n  ${[...files, 'SHA256SUMS.txt'].join('\n  ')}\n`)

const assets = [...files, 'SHA256SUMS.txt'].map(f => `"release/${f}"`).join(' ')
const command = `gh release create v${v} ${assets} --title "Mitzi ${v}" --generate-notes`
if (process.argv.includes('--subir')) {
  run(command)
  console.log('\nPublicada. Las apps instaladas la verán al abrirse.\n')
} else {
  console.log(`Para publicarla (queda pública en GitHub):\n  npm run publicar -- --subir\no a mano:\n  ${command}\n`)
}
