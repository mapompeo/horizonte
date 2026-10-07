import type { UpdateAction, UpdateStatus } from '../../shared/updates'

export interface UpdateEvents {
  available(version: string): void
  current(): void
  progress(percent: number): void
  downloaded(): void
  error(): void
}

export function createUpdater(deps: {
  supported: boolean
  currentVersion: string
  listen(events: UpdateEvents): void
  check(): Promise<unknown>
  download(): Promise<unknown>
  install(): void
  canInstall(): boolean
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
    state = { ...state, message: undefined, ...patch }
    listeners.forEach((listener) => listener(state))
  }
  const fail = (): void =>
    set({ phase: 'error', message: 'Não consegui atualizar. Confira a conexão e tente de novo.' })
  deps.listen({
    available: (version) => set({ phase: 'available', version }),
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
        if (action === 'check') {
          set({ phase: 'checking' })
          await deps.check()
          if ((state as UpdateStatus).phase === 'checking') set({ phase: 'current' })
        } else if (action === 'download' && state.phase === 'available') {
          set({ phase: 'downloading', percent: 0 })
          await deps.download()
        } else if (action === 'install' && state.phase === 'ready') {
          if (deps.canInstall()) deps.install()
          else set({ message: 'Encerre a conexão antes de instalar a atualização.' })
        }
      } catch {
        fail()
      }
      return state
    }
  }
}
