import type { Pairing } from './api'

export interface PairingWatcherOptions {
  api: { listPairings(): Promise<Pairing[]> }
  intervalMs?: number
  maxBackoffMs?: number
  onRequest(pairing: Pairing): void
  onCancelled(pairingId: string): void
  onError?(cause: unknown): void
}

export interface PairingWatcher {
  start(): void
  stop(): void
}

/** Consulta os pedidos de pareamento em série (nunca duas consultas ao mesmo tempo). */
export function createPairingWatcher(options: PairingWatcherOptions): PairingWatcher {
  const interval = options.intervalMs ?? 2000
  const maxBackoff = options.maxBackoffMs ?? 10_000
  const known = new Map<string, Pairing>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let run = 0
  let failures = 0

  const report = (cause: unknown): void => {
    try {
      options.onError?.(cause)
    } catch {
      // quem escuta o erro também falhou; não há mais o que fazer
    }
  }

  const guarded = (callback: () => void): void => {
    try {
      callback()
    } catch (cause) {
      report(cause)
    }
  }

  function schedule(token: number, delay: number): void {
    if (token !== run) return
    timer = setTimeout(() => void poll(token), delay)
  }

  async function poll(token: number): Promise<void> {
    let list: Pairing[]
    try {
      list = await options.api.listPairings()
    } catch (cause) {
      if (token !== run) return
      failures++
      report(cause)
      schedule(token, Math.min(interval * 2 ** failures, maxBackoff))
      return
    }
    if (token !== run) return
    failures = 0

    const present = new Set(list.map((pairing) => pairing.id))
    for (const pairing of list) {
      if (known.has(pairing.id)) continue
      known.set(pairing.id, pairing)
      guarded(() => options.onRequest(pairing))
    }
    for (const id of [...known.keys()]) {
      if (present.has(id)) continue
      known.delete(id)
      guarded(() => options.onCancelled(id))
    }
    schedule(token, interval)
  }

  return {
    start() {
      if (active) return
      active = true
      void poll(++run)
    },
    stop() {
      active = false
      run++
      known.clear()
      failures = 0
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}
