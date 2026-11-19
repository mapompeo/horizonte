import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'

/**
 * Processos auxiliares que o app abre e que ficam rodando (vigia da área de transferência, auxiliar do mouse, tela
 * virtual). No Windows, um filho não morre junto com o app: sem isto, cada vez que o Horizonte fechava sobrava um
 * PowerShell ou um auxiliar rodando sozinho. Todo `spawn` de longa duração passa por aqui e morre na saída.
 */
const live = new Set<ChildProcess>()

export function track<T extends ChildProcess>(child: T): T {
  live.add(child)
  child.once('exit', () => live.delete(child))
  child.once('error', () => live.delete(child))
  return child
}

/** O mesmo `spawn` do Node, já registrado para morrer quando o app fechar. */
export const spawn = ((...args: Parameters<typeof nodeSpawn>) =>
  track(nodeSpawn(...args))) as typeof nodeSpawn

/** Mata todos os filhos ainda vivos (na saída do app). */
export function killChildren(): void {
  for (const child of live) {
    try {
      child.kill()
    } catch {
      // Já morreu.
    }
  }
  live.clear()
}

export const liveChildren = (): number => live.size
