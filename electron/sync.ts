import dgram from 'node:dgram'
import http from 'node:http'
import os from 'node:os'

/**
 * Servidor de la sincronización por Wi-Fi: abierto mientras haya equipos vinculados (o se esté
 * vinculando uno). Lo que llega va cifrado; la ventana lo abre, lo une con su base de datos y
 * devuelve la respuesta (aquí no se lee nada). Cuándo dejar de aceptar el código para vincular
 * lo decide la ventana.
 * También responde por UDP a «¿dónde estás?»: si la PC cambió de dirección, el teléfono la encuentra.
 */
const PATH = '/mitzi-sync'
const MAX_BODY = 64 * 1024 * 1024
const ASK = 'MITZI?'
const ANSWER = 'MITZI!'

type Reply = (ok: boolean, body: string) => void

/** Direcciones IPv4 de esta PC en la red local, las de Wi-Fi y cable primero. */
export function localAddresses() {
  const out: { address: string; score: number }[] = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue
      // las de máquinas virtuales (WSL, VirtualBox, Hyper-V) van al final: el teléfono no las ve
      const virtual = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker/i.test(name)
      const lan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address)
      out.push({ address: info.address, score: (lan ? 2 : 0) + (virtual ? -3 : 0) + (/wi-?fi|wlan|inal/i.test(name) ? 1 : 0) })
    }
  }
  return out.sort((a, b) => b.score - a.score).map(a => a.address).slice(0, 4)
}

export class SyncServer {
  private server: http.Server | null = null
  private pending = new Map<number, Reply>()
  private nextId = 1
  private finder: dgram.Socket | null = null
  private current: { hosts: string[]; port: number } | null = null

  get running() {
    return !!this.server
  }

  /**
   * `onRequest` le pasa el pedido a la ventana; la respuesta vuelve por `reply()`. Si ya estaba
   * abierto, solo se cambia a quién se le pasan los pedidos (la ventana se recargó).
   */
  async start(preferredPort: number, me: { id: string; label: string }, onRequest: (id: number, body: string, remote: string) => void) {
    this.onRequest = onRequest
    if (this.server && this.current) return { ...this.current, hosts: localAddresses() }
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== PATH) {
        res.writeHead(404).end()
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY) req.destroy()
        else chunks.push(chunk)
      })
      req.on('end', () => {
        const id = this.nextId++
        const timeout = setTimeout(() => this.reply(id, false, 'sin respuesta'), 60_000)
        this.pending.set(id, (ok, body) => {
          clearTimeout(timeout)
          if (ok) {
            // con el tamaño exacto: sin él, Node responde «por partes» (chunked) y el lector
            // mínimo de Android recibía los tamaños de cada parte mezclados con los datos
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }).end(body)
            return
          }
          res.writeHead(403, { Connection: 'close' }).end()
        })
        // la dirección sin el prefijo de IPv6 («::ffff:192.168.1.5»)
        const remote = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
        this.onRequest?.(id, Buffer.concat(chunks).toString('utf8'), remote)
      })
    })
    const port = await new Promise<number>((resolve, reject) => {
      const listen = (p: number) => {
        server.once('error', (e: NodeJS.ErrnoException) => {
          // si el puerto de siempre está ocupado, cualquiera libre (va dentro del código QR)
          if (e.code === 'EADDRINUSE' && p !== 0) listen(0)
          else reject(e)
        })
        server.listen(p, '0.0.0.0', () => resolve((server.address() as { port: number }).port))
      }
      listen(preferredPort)
    })
    this.server = server
    this.current = { hosts: localAddresses(), port }
    this.listenForSearches(port, me)
    return this.current
  }

  private onRequest: ((id: number, body: string, remote: string) => void) | null = null

  /** Responde a quien pregunte en la red por una PC con Mitzi (solo dice su id y su puerto). */
  private listenForSearches(port: number, me: { id: string; label: string }) {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('message', (msg, from) => {
      if (msg.toString('utf8') !== ASK) return
      socket.send(`${ANSWER}${JSON.stringify({ id: me.id, port })}`, from.port, from.address)
    })
    // si no se puede (puerto ocupado, sin red), se sigue sin búsqueda: las direcciones guardadas bastan
    socket.on('error', () => socket.close())
    socket.bind(port)
    this.finder = socket
  }

  reply(id: number, ok: boolean, body: string) {
    const done = this.pending.get(id)
    if (!done) return
    this.pending.delete(id)
    done(ok, body)
  }

  async stop() {
    for (const id of [...this.pending.keys()]) this.reply(id, false, 'cerrado')
    try {
      this.finder?.close()
    } catch {
      // ya estaba cerrado
    }
    this.finder = null
    this.current = null
    this.onRequest = null
    const server = this.server
    this.server = null
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

/** Del lado que manda (PC con PC): prueba cada dirección de la otra PC hasta que una responda. */
export async function syncRequest(hosts: string[], port: number, body: string) {
  let lastError: Error = new Error('No se encontró la PC en la red')
  for (const host of hosts) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const req = http.request(
          { host, port, path: PATH, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 4000 },
          res => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () => {
              if (res.statusCode === 200) resolve(Buffer.concat(chunks).toString('utf8'))
              else if (res.statusCode === 403) reject(new Error('El código no coincide'))
              else reject(new Error(`La PC respondió ${res.statusCode}`))
            })
          },
        )
        // una vez conectados, unir los datos puede tardar: se espera más
        req.on('socket', socket => socket.on('connect', () => req.setTimeout(90_000)))
        req.on('timeout', () => req.destroy(new Error('No responde')))
        req.on('error', reject)
        req.end(body)
      })
    } catch (e) {
      lastError = e as Error
      if (lastError.message === 'El código no coincide') throw lastError
    }
  }
  throw lastError
}

/** Pregunta en la red qué PC con Mitzi está esperando (PC con PC; el teléfono lo hace en Java). */
export function discover(port: number, waitMs = 1500) {
  return new Promise<{ host: string; port: number; id: string }[]>(resolve => {
    const found: { host: string; port: number; id: string }[] = []
    const socket = dgram.createSocket('udp4')
    socket.on('message', (msg, from) => {
      const text = msg.toString('utf8')
      if (!text.startsWith(ANSWER)) return
      try {
        const info = JSON.parse(text.slice(ANSWER.length)) as { id: string; port: number }
        if (!found.some(f => f.host === from.address)) found.push({ host: from.address, port: info.port, id: info.id })
      } catch {
        // respuesta rara: se ignora
      }
    })
    socket.on('error', () => resolve(found))
    socket.bind(() => {
      socket.setBroadcast(true)
      socket.send(ASK, port, '255.255.255.255')
    })
    setTimeout(() => {
      socket.close()
      resolve(found)
    }, waitMs)
  })
}
