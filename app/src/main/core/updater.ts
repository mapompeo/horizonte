import type { UpdateAction, UpdateStatus } from '../../shared/updates'
import { errorFix, errorTitle, type ErrorCode } from '../../shared/errors'

export interface UpdateEvents {
  available(version: string): void
  current(): void
  progress(percent: number): void
  downloaded(): void
  /** Erro do atualizador: o passo em andamento diz o código (procurar, baixar ou instalar). */
  error(cause?: unknown): void
}

export function createUpdater(deps: {
  supported: boolean
  /** Baixa sozinho quando acha versão nova; aí só falta reiniciar. */
  autoDownload?: boolean
  currentVersion: string
  listen(events: UpdateEvents): void
  check(): Promise<unknown>
  download(): Promise<unknown>
  install(): void
  canInstall(): boolean
  /** Encerra a conexão em andamento: o botão de atualizar faz isso sozinho, sem pedir. */
  stop(): void
  /** Registro de cada falha, com o motivo (o arquivo de log do atualizador). */
  log?(line: string): void
}): {
  status(): UpdateStatus
  perform(action: UpdateAction): Promise<UpdateStatus>
  subscribe(listener: (status: UpdateStatus) => void): () => void
} {
  let state: UpdateStatus = {
    phase: deps.supported ? 'idle' : 'unavailable',
    currentVersion: deps.currentVersion
  }
  const listeners = new Set<(status: UpdateStatus) => void>()
  const set = (patch: Partial<UpdateStatus>): void => {
    state = { ...state, message: undefined, code: undefined, ...patch }
    listeners.forEach((listener) => listener(state))
  }
  /** O passo que falhou vira o código: quem lê o código sabe onde parou. */
  let installing = false
  const fail = (cause?: unknown): void => {
    const code: ErrorCode = installing
      ? 'HZ-503'
      : state.phase === 'downloading' || state.phase === 'ready'
        ? 'HZ-502'
        : 'HZ-501'
    installing = false
    deps.log?.(`${code}: ${cause instanceof Error ? cause.message : String(cause ?? '')}`)
    set({ phase: 'error', code, message: `${errorTitle(code)}. ${errorFix(code)}` })
  }
  const startDownload = async (): Promise<void> => {
    set({ phase: 'downloading', percent: 0 })
    try {
      await deps.download()
    } catch (error) {
      fail(error)
    }
  }
  deps.listen({
    available: (version) => {
      if (state.phase === 'downloading' || state.phase === 'ready') return
      set({ phase: 'available', version })
      if (deps.autoDownload) void startDownload()
    },
    current: () => set({ phase: 'current' }),
    progress: (percent) =>
      set({ phase: 'downloading', percent: Math.min(100, Math.max(0, percent)) }),
    downloaded: () => set({ phase: 'ready', percent: 100 }),
    error: fail
  })
  return {
    status: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async perform(action) {
      if (!deps.supported || state.phase === 'checking' || state.phase === 'downloading')
        return state
      try {
        if (action === 'check' && state.phase !== 'ready') {
          set({ phase: 'checking' })
          await deps.check()
          if ((state as UpdateStatus).phase === 'checking') set({ phase: 'current' })
        } else if (action === 'download' && state.phase === 'available') {
          await startDownload()
        } else if (action === 'install' && state.phase === 'ready') {
          if (!deps.canInstall()) deps.stop()
          installing = true
          deps.install()
        }
      } catch (error) {
        fail(error)
      }
      return state
    }
  }
}
