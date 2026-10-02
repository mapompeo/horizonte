import { countSessionEvents, logSignature } from './log'

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
    baseline: { signature: string; connected: number; disconnected: number } | null
  ): Promise<void> {
    let next = baseline
    try {
      const log = await options.readLog()
      if (token !== run) return
      const counts = countSessionEvents(log)
      const signature = logSignature(log)

      if (next === null) {
        next = { signature, ...counts }
      } else {
        const restarted =
          signature !== next.signature ||
          counts.connected < next.connected ||
          counts.disconnected < next.disconnected
        const base = restarted ? { connected: 0, disconnected: 0 } : next
        const connected = Math.min(counts.connected - base.connected, MAX_EVENTS_PER_POLL)
        const disconnected = Math.min(counts.disconnected - base.disconnected, MAX_EVENTS_PER_POLL)
        next = { signature, ...counts }
        for (let i = 0; i < connected; i++) {
          try {
            options.onConnected(options.deviceName())
          } catch (cause) {
            report(cause)
          }
        }
        for (let i = 0; i < disconnected; i++) {
          try {
            options.onDisconnected()
          } catch (cause) {
            report(cause)
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
