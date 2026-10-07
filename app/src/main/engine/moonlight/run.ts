import type { MoonlightProcess } from './client'

/**
 * Espera o processo terminar e devolve o código de saída. Se passar do limite, encerra o processo e devolve
 * `null`: um `pair` que não termina não pode deixar a conexão parada para sempre.
 */
export function waitForExit(
  child: MoonlightProcess,
  timeoutMs: number,
  onError?: (listener: () => void) => void
): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, timeoutMs)
    const done = (code: number | null): void => {
      clearTimeout(timer)
      resolve(code)
    }
    child.onExit(done)
    onError?.(() => done(null))
  })
}
