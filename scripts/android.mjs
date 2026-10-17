// Compila Mitzi para Android y deja el APK en release/.
// Uso: npm run android            (solo compila)
//      npm run android -- --install (además lo instala en el teléfono conectado por USB)
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const win = process.platform === 'win32'
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts })

function findJava() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME
  const base = win ? 'C:\\Program Files\\Microsoft' : '/usr/lib/jvm'
  const jdk = fs.existsSync(base) && fs.readdirSync(base).find(d => /jdk-?21/.test(d))
  if (jdk) return path.join(base, jdk)
  throw new Error('No encontré Java 21. Instálalo (por ejemplo, Microsoft OpenJDK 21) o define JAVA_HOME.')
}

function findSdk() {
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

const java = findJava()
const sdk = findSdk()
// Gradle lee la ruta del SDK de local.properties (no se sube a git)
fs.writeFileSync(path.join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`)
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk }

run('npx tsc -b')
run('npx vite build')
run('npx cap sync android')
run(win ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug', { cwd: path.join(root, 'android'), env })

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const out = path.join(root, 'release', `Mitzi-${version}-debug.apk`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.copyFileSync(apk, out)
console.log(`\nAPK listo: ${path.relative(root, out)}`)

if (process.argv.includes('--install')) {
  const adb = path.join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb')
  run(`"${adb}" install -r "${out}"`)
}
