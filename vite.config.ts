import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const testBooksDir = path.join(root, 'libros-prueba')
const BOOK_EXT = /\.(epub|pdf)$/i

type DevBook = { path: string; name: string; size: number; mtime: number }

function listBooks(dir: string, base = dir, depth = 0): DevBook[] {
  if (depth > 6 || !fs.existsSync(dir)) return []
  const out: DevBook[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listBooks(full, base, depth + 1))
    else if (BOOK_EXT.test(entry.name)) {
      const stat = fs.statSync(full)
      out.push({
        path: path.relative(base, full).split(path.sep).join('/'),
        name: entry.name,
        size: stat.size,
        mtime: Math.round(stat.mtimeMs),
      })
    }
  }
  return out
}

/**
 * Solo en desarrollo con navegador: expone los libros de `libros-prueba/`
 * y avisa a la app cuando se agregan o borran archivos.
 */
function devBooks(): Plugin {
  return {
    name: 'mitzi-dev-books',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(testBooksDir, { recursive: true })
      server.watcher.add(testBooksDir)
      const notify = (file: string) => {
        if (BOOK_EXT.test(file)) server.ws.send({ type: 'custom', event: 'mitzi:library-changed' })
      }
      server.watcher.on('add', notify)
      server.watcher.on('unlink', notify)
      server.watcher.on('change', notify)

      server.middlewares.use('/__mitzi/books', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ folder: testBooksDir, books: listBooks(testBooksDir) }))
      })
      server.middlewares.use('/__mitzi/book', (req, res) => {
        const rel = new URL(req.url ?? '', 'http://x').searchParams.get('path') ?? ''
        const full = path.resolve(testBooksDir, rel)
        if (!full.startsWith(testBooksDir + path.sep) || !fs.existsSync(full)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', 'application/octet-stream')
        fs.createReadStream(full).pipe(res)
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), devBooks()],
  resolve: {
    alias: {
      'foliate-js': path.join(root, 'vendor/foliate-js'),
    },
  },
  server: {
    port: 5173,
    watch: { ignored: ['**/dist-electron/**', '**/android/**'] },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
})
