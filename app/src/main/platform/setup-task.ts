import type { PrepProgress } from '../../shared/types'
import type { EngineInstaller } from './types'

/** Não desfaz uma operação enviada ao SO; impede iniciar a próxima depois do cancelamento. */
export async function setupStep<T>(
  signal: AbortSignal | undefined,
  action: () => Promise<T>
): Promise<T> {
  signal?.throwIfAborted()
  const result = await action()
  signal?.throwIfAborted()
  return result
}

/** Compartilha chamadas da mesma tentativa; sinais diferentes aguardam e refazem a preparação. */
export function createSetupTask(
  run: (report: (progress: PrepProgress) => void, signal?: AbortSignal) => Promise<void>
): EngineInstaller['ensureInstalled'] {
  let inFlight: {
    promise: Promise<void>
    signal: AbortSignal | undefined
    report: (progress: PrepProgress) => void
  } | null = null
  return async (onReport, signal) => {
    signal?.throwIfAborted()
    while (inFlight) {
      if (inFlight.signal === signal) {
        if (onReport) inFlight.report = onReport
        return inFlight.promise
      }
      await inFlight.promise.catch(() => undefined)
      signal?.throwIfAborted()
    }
    const task = { signal, report: onReport ?? (() => undefined), promise: Promise.resolve() }
    inFlight = task
    task.promise = Promise.resolve()
      .then(() =>
        setupStep(signal, () =>
          run((progress) => {
            if (!signal?.aborted) task.report(progress)
          }, signal)
        )
      )
      .finally(() => {
        if (inFlight === task) inFlight = null
      })
    return task.promise
  }
}
