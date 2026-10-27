// Compila Mitzi para Android y deja el APK en release/.
// Uso: npm run android                (APK de prueba)
//      npm run android -- --install   (además lo instala en el teléfono conectado por USB)
//      npm run android -- --release   (versión para publicar, firmada con tu llave: npm run llave)
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { findJava, findSdk, keyProperties, root, version, win } from './entorno.mjs'

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts })
const release = process.argv.includes('--release')

if (release && !fs.existsSync(keyProperties)) {
  console.error('\nFalta tu llave de firma. Créala una sola vez con:  npm run llave\n')
  process.exit(1)
}

const java = findJava()
const sdk = findSdk()
// Gradle lee la ruta del SDK de local.properties (no se sube a git)
fs.writeFileSync(path.join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`)
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, MITZI_KEYSTORE_PROPERTIES: keyProperties }

run('npx tsc -b')
run('npx vite build')
run('npx cap sync android')
const task = release ? 'assembleRelease' : 'assembleDebug'
run(win ? `.\\gradlew.bat ${task}` : `./gradlew ${task}`, { cwd: path.join(root, 'android'), env })

const kind = release ? 'release' : 'debug'
const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', kind, `app-${kind}.apk`)
const out = path.join(root, 'release', release ? `Mitzi-${version()}.apk` : `Mitzi-${version()}-prueba.apk`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.copyFileSync(apk, out)
console.log(`\nAPK listo: ${path.relative(root, out)}`)

if (process.argv.includes('--install')) {
  const adb = path.join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb')
  run(`"${adb}" install -r "${out}"`)
}
