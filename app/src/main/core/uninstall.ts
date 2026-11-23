import type { UninstallResult } from '../../shared/uninstall'

/** Como remover o Horizonte neste computador: o que a confirmação explica e o que faz. */
export interface UninstallPlan {
  detail: string
  run(): Promise<void>
}

/** Quem pede senha ao sistema (pkexec) e a pessoa fecha a janela: não é falha, é desistência. */
export class UninstallCancelled extends Error {}

export function createUninstaller(deps: {
  packaged: boolean
  plan(): UninstallPlan | null
  busy(): boolean
  /** Encerra a conexão em andamento: desinstalar faz isso sozinho, sem pedir. */
  stop(): void
  confirm(detail: string): Promise<boolean>
  quit(): void
}): () => Promise<UninstallResult> {
  let pending: Promise<UninstallResult> | undefined
  async function run(): Promise<UninstallResult> {
    if (!deps.packaged) return 'unavailable'
    const plan = deps.plan()
    if (!plan) return 'unavailable'
    try {
      if (!(await deps.confirm(plan.detail))) return 'cancelled'
      if (deps.busy()) deps.stop()
      await plan.run()
      deps.quit()
      return 'started'
    } catch (error) {
      return error instanceof UninstallCancelled ? 'cancelled' : 'failed'
    }
  }
  return () => {
    pending ??= run().finally(() => {
      pending = undefined
    })
    return pending
  }
}
