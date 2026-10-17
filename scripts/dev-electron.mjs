// Arranca Vite y abre Mitzi en Electron apuntando al servidor de desarrollo.
import { createServer } from 'vite'
import { spawn, execSync } from 'node:child_process'
import electronPath from 'electron'

execSync('npx tsc -p electron/tsconfig.json', { stdio: 'inherit' })

const server = await createServer()
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/'
server.printUrls()

const child = spawn(String(electronPath), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})
child.on('close', async code => {
  await server.close()
  process.exit(code ?? 0)
})
