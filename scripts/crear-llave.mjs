// Crea, una sola vez, la llave con la que se firman las versiones de Mitzi para Android.
// Uso: npm run llave
//
// Android solo instala una actualización encima de otra si las dos están firmadas con la
// misma llave: así nadie más puede publicar «actualizaciones» de tu Mitzi. La llave se
// guarda FUERA del repositorio (en ~/.mitzi/) y nunca se sube a GitHub.
// HAZ UN RESPALDO de esa carpeta (una USB, tu nube): si la pierdes, ya no podrás publicar
// actualizaciones que se instalen encima de las anteriores.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { findJava, keyDir, keyProperties, win } from './entorno.mjs'

const jks = path.join(keyDir, 'mitzi-release.jks')
if (fs.existsSync(jks) || fs.existsSync(keyProperties)) {
  console.log(`\nYa tienes una llave en ${keyDir}. No se crea otra (cambiarla rompería las actualizaciones).\n`)
  process.exit(0)
}

fs.mkdirSync(keyDir, { recursive: true })
// contraseña larga y aleatoria: solo la usan los scripts, queda guardada junto a la llave
const password = crypto.randomBytes(24).toString('base64url')
const keytool = path.join(findJava(), 'bin', win ? 'keytool.exe' : 'keytool')
execFileSync(
  keytool,
  [
    '-genkeypair', '-keystore', jks, '-storetype', 'PKCS12', '-alias', 'mitzi',
    '-keyalg', 'RSA', '-keysize', '4096', '-validity', '36500',
    '-storepass', password, '-keypass', password,
    '-dname', 'CN=Luis Angel Lopez, O=Mitzi',
  ],
  { stdio: 'inherit' },
)
fs.writeFileSync(
  keyProperties,
  [`storeFile=${jks.replace(/\\/g, '/')}`, `storePassword=${password}`, 'keyAlias=mitzi', `keyPassword=${password}`, ''].join('\n'),
)

console.log(`
Llave creada en ${keyDir}
  - mitzi-release.jks      (la llave)
  - keystore.properties    (su contraseña)

IMPORTANTE: copia esa carpeta a un lugar seguro (una USB o tu nube personal).
No la subas a GitHub ni se la pases a nadie. Si la pierdes, las próximas versiones
no se podrán instalar encima de las que ya tengan los demás.
`)
