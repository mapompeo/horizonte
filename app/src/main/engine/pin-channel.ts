import { createServer, type Server } from 'node:http'
import { cleanName } from '../../shared/names'

export const PIN_CHANNEL_PORT = 47900
const PIN_TTL_MS = 2 * 60_000
const MAX_BODY = 512
const MAX_PINS = 16

export interface PinChannel {
  start(): Promise<void>
  stop(): Promise<void>
  /** Entrega (uma vez) o PIN que este dispositivo mandou, se ainda for recente. */
  take(device: string): string | undefined
}

/**
 * Canal próprio do pareamento sem PIN: o outro dispositivo gera o PIN e o manda para cá. Ele só guarda o
 * número; quem decide é a pessoa, no aviso "Permitir este dispositivo?". Só fica aberto enquanto este
 * aparelho espera uma conexão.
 */
export function createPinChannel(
  options: { port?: number; now?: () => number } = {}
): PinChannel & { port(): number } {
  const now = options.now ?? Date.now
  const pins = new Map<string, { pin: string; at: number }>()
  let server: Server | null = null
  let opening: Promise<void> | null = null

  const key = (device: string): string => cleanName(device).toLowerCase()

  function handle(raw: string): boolean {
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return false
    }
    const { device, pin } = (body ?? {}) as { device?: unknown; pin?: unknown }
    if (typeof device !== 'string' || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return false
    const name = key(device)
    if (!name) return false
    if (!pins.has(name) && pins.size >= MAX_PINS) pins.delete(pins.keys().next().value as string)
    pins.set(name, { pin, at: now() })
    return true
  }

  return {
    port: () =>
      (server?.address() as { port: number } | null)?.port ?? options.port ?? PIN_CHANNEL_PORT,
    start() {
      if (opening) return opening
      if (server) return Promise.resolve()
      const created = createServer((request, response) => {
        if (request.method !== 'POST' || request.url !== '/pin') {
          response.writeHead(404).end()
          return
        }
        let raw = ''
        request.on('data', (chunk: Buffer) => {
          raw += chunk.toString('utf8')
          if (raw.length > MAX_BODY) request.destroy()
        })
        request.on('end', () => response.writeHead(handle(raw) ? 204 : 400).end())
      })
      server = created
      const pending = new Promise<void>((resolve, reject) => {
        created.once('error', (error) => {
          if (server === created) server = null
          reject(error)
        })
        created.listen(options.port ?? PIN_CHANNEL_PORT, () => {
          resolve()
        })
      })
      opening = pending
      const clearOpening = (): void => {
        if (opening === pending) opening = null
      }
      void pending.then(clearOpening, clearOpening)
      return pending
    },
    stop() {
      pins.clear()
      const closing = server
      const pending = opening
      server = null
      opening = null
      return (pending ?? Promise.resolve())
        .catch(() => undefined)
        .then(
          () =>
            new Promise<void>((resolve) => (closing ? closing.close(() => resolve()) : resolve()))
        )
    },
    take(device) {
      const entry = pins.get(key(device))
      if (!entry) return undefined
      pins.delete(key(device))
      return now() - entry.at <= PIN_TTL_MS ? entry.pin : undefined
    }
  }
}

/** Lado de quem recebe: manda o PIN gerado ao dispositivo que envia. */
export async function sendPin(host: string, device: string, pin: string): Promise<void> {
  const response = await fetch(`http://${host}:${PIN_CHANNEL_PORT}/pin`, {
    method: 'POST',
    body: JSON.stringify({ device, pin }),
    signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error('O outro dispositivo não aceitou o pedido de pareamento.')
}
