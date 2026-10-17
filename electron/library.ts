import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { BookFile, LibraryFolders } from '../shared/native-api.js'

const BOOK_EXT = /\.(epub|pdf)$/i
const MAX_DEPTH = 8

interface Config {
  folders: string[]
}

/** Carpetas de la biblioteca en PC: guardarlas, recorrerlas y vigilar cambios. */
export class LibraryService {
  #folders: string[] = []
  #watchers: fs.FSWatcher[] = []
  #onChange: () => void = () => {}
  #debounce: NodeJS.Timeout | undefined

  constructor(
    private configPath: string,
    readonly defaultFolder: string,
    private extraFolders: string[] = [],
  ) {}

  async init(onChange: () => void) {
    this.#onChange = onChange
    try {
      const config = JSON.parse(await fsp.readFile(this.configPath, 'utf8')) as Config
      this.#folders = config.folders.filter(f => typeof f === 'string')
    } catch {
      this.#folders = [this.defaultFolder]
    }
    await fsp.mkdir(this.defaultFolder, { recursive: true })
    for (const f of this.extraFolders) await fsp.mkdir(f, { recursive: true })
    this.#rewatch()
  }

  get folders() {
    return [...new Set([...this.#folders, ...this.extraFolders])]
  }

  getFolders(): LibraryFolders {
    return { folders: this.folders, defaultFolder: this.defaultFolder }
  }

  async addFolder(folder: string) {
    if (this.#folders.includes(folder)) return
    this.#folders.push(folder)
    await this.#save()
    this.#rewatch()
    this.#onChange()
  }

  async removeFolder(folder: string) {
    this.#folders = this.#folders.filter(f => f !== folder)
    await this.#save()
    this.#rewatch()
    this.#onChange()
  }

  async scan(): Promise<BookFile[]> {
    const out: BookFile[] = []
    const seen = new Set<string>()
    for (const folder of this.folders) await walk(folder, 0, out, seen)
    return out
  }

  /** Solo se pueden leer archivos dentro de las carpetas de la biblioteca. */
  isInsideLibrary(file: string) {
    const resolved = path.resolve(file)
    return this.folders.some(folder => {
      const rel = path.relative(path.resolve(folder), resolved)
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    })
  }

  async readBook(file: string) {
    if (!this.isInsideLibrary(file) || !BOOK_EXT.test(file)) throw new Error('Ruta fuera de la biblioteca')
    return fsp.readFile(file)
  }

  /** Copia a la carpeta principal los libros arrastrados a la ventana. */
  async importFiles(files: string[]) {
    let count = 0
    for (const file of files) {
      if (!BOOK_EXT.test(file) || this.isInsideLibrary(file)) continue
      const parsed = path.parse(file)
      let target = path.join(this.defaultFolder, parsed.base)
      for (let i = 2; fs.existsSync(target); i++)
        target = path.join(this.defaultFolder, `${parsed.name} (${i})${parsed.ext}`)
      await fsp.copyFile(file, target)
      count++
    }
    return count
  }

  dispose() {
    for (const w of this.#watchers) w.close()
    this.#watchers = []
  }

  async #save() {
    await fsp.mkdir(path.dirname(this.configPath), { recursive: true })
    await fsp.writeFile(this.configPath, JSON.stringify({ folders: this.#folders } satisfies Config, null, 2))
  }

  #rewatch() {
    this.dispose()
    for (const folder of this.folders) {
      try {
        const watcher = fs.watch(folder, { recursive: true }, (_event, filename) => {
          if (filename && !BOOK_EXT.test(filename.toString())) return
          clearTimeout(this.#debounce)
          // espera a que termine de copiarse el archivo
          this.#debounce = setTimeout(() => this.#onChange(), 700)
        })
        watcher.on('error', () => watcher.close())
        this.#watchers.push(watcher)
      } catch {
        // la carpeta pudo haberse borrado; se ignora hasta el próximo cambio
      }
    }
  }
}

async function walk(dir: string, depth: number, out: BookFile[], seen: Set<string>) {
  if (depth > MAX_DEPTH) return
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, depth + 1, out, seen)
    else if (entry.isFile() && BOOK_EXT.test(entry.name) && !seen.has(full)) {
      try {
        const stat = await fsp.stat(full)
        if (stat.size === 0) continue
        seen.add(full)
        out.push({ path: full, name: entry.name, size: stat.size, mtime: Math.round(stat.mtimeMs) })
      } catch {
        // archivo borrado mientras se recorría
      }
    }
  }
}
