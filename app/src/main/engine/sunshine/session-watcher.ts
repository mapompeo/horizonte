import { logSignature, sessionEvents } from './log'

export interface SessionWatcherOptions {
  readLog(): Promise<string>
  intervalMs?: number
  /** Nome a mostrar para o cliente (o log do Sunshine não diz quem conectou). */
  deviceName(): string
  onConnected(device: string): void
  onDisconnected(): void
  onError?(cause: unknown): void
}

const MAX_EVENTS_PER_POLL = 5

/** Lê o log em intervalos e avisa só do que aconteceu DEPOIS que começou a vigiar. */
export function createSessionWatcher(options: SessionWatcherOptions): {
  start(): void
  stop(): void
} {
  const interval = options.intervalMs ?? 1000
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let run = 0

  const report = (cause: unknown): void => {
    try {
      options.onError?.(cause)
    } catch {
      // nada a fazer
    }
  }

  async function poll(
    token: number,
    baseline: { signature: string; seen: number } | null
  ): Promise<void> {
    let next = baseline
    try {
      const log = await options.readLog()
      if (token !== run) return
      // Log vazio é arquivo ausente ou travado (o Sunshine está reiniciando): não é um log novo.
      if (log !== '') {
        const events = sessionEvents(log)
        const signature = logSignature(log)

        if (next === null) {
          next = { signature, seen: events.length }
        } else {
          // Só a abertura de outra execução (nas duas pontas) ou menos eventos que antes provam reinício.
          const restarted =
            (signature !== '' && next.signature !== '' && signature !== next.signature) ||
            events.length < next.seen
          const fresh = events.slice(restarted ? 0 : next.seen).slice(-MAX_EVENTS_PER_POLL)
          next = { signature: signature || next.signature, seen: events.length }
          for (const event of fresh) {
            try {
              if (event === 'connected') options.onConnected(options.deviceName())
              else options.onDisconnected()
            } catch (cause) {
              report(cause)
            }
          }
        }
      }
    } catch (cause) {
      if (token !== run) return
      report(cause)
    }
    if (token !== run) return
    timer = setTimeout(() => void poll(token, next), interval)
  }

  return {
    start() {
      if (active) return
      active = true
      void poll(++run, null)
    },
    stop() {
      active = false
      run++
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}
