import type { Host } from '../../../shared/types'

/** Quantas buscas vazias seguidas até o aparelho sair da lista: um anúncio que falha uma vez não conta. */
const MISSES_BEFORE_CLEAR = 2

/**
 * Procura aparelhos de novo e de novo enquanto a tela está aberta. Uma busca só (como era) deixava a lista
 * vazia para sempre quando o anúncio não chegava naquela janela de 1,5 s. Devolve a função que para.
 */
export function pollHosts(
  list: () => Promise<Host[]>,
  onUpdate: (hosts: Host[], searching: boolean) => void,
  options: { intervalMs?: number } = {}
): () => void {
  const intervalMs = options.intervalMs ?? 3000
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let hosts: Host[] = []
  let misses = 0

  const tick = async (): Promise<void> => {
    let found: Host[] | null = null
    try {
      found = await list()
    } catch {
      found = null // erro de rede: mantém o que já tinha e tenta de novo
    }
    if (stopped) return
    if (found !== null) {
      if (found.length > 0) {
        hosts = found
        misses = 0
      } else if (++misses >= MISSES_BEFORE_CLEAR) {
        hosts = []
      }
      onUpdate(hosts, false)
    }
    timer = setTimeout(() => void tick(), intervalMs)
  }

  void tick()
  return () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
  }
}
