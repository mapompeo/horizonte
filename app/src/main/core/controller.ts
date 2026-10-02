import type {
  AppEvent,
  AppState,
  Host,
  Settings,
  SettingsPatch,
  Snapshot
} from '../../shared/types'
import type { EnginePort } from '../engine/port'
import { reduce } from './machine'
import { parseSettings, type SettingsStore } from './settings'

export interface ControllerDeps {
  engine: EnginePort
  store: SettingsStore
  initial?: AppState
}

export interface Controller {
  getSnapshot(): Snapshot
  dispatch(event: AppEvent): void
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  subscribe(listener: (snapshot: Snapshot) => void): () => void
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export async function createController({
  engine,
  store,
  initial = { screen: 'install' }
}: ControllerDeps): Promise<Controller> {
  let state: AppState = initial
  let settings = await store.load()
  /** Cada preparação recebe um número; só a mais recente pode mexer no estado. */
  let prepareRun = 0
  const listeners = new Set<(snapshot: Snapshot) => void>()

  const snapshot = (): Snapshot => ({ state, settings })

  function notify(): void {
    const current = snapshot()
    for (const listener of [...listeners]) listener(current)
  }

  function fail(message: string, cause: unknown): void {
    dispatch({ type: 'FAIL', error: { message, detail: describeError(cause) } })
  }

  function runEffects(prev: AppState, next: AppState, event: AppEvent): void {
    // Sair da preparação por qualquer caminho abandona a execução em andamento.
    if (prev.screen === 'preparing' && next.screen !== 'preparing') prepareRun++

    if (next.screen === 'preparing' && prev.screen !== 'preparing') {
      const run = ++prepareRun
      const live = (): boolean => run === prepareRun
      engine
        .prepare((step) => {
          if (live()) dispatch({ type: 'PREP_STEP', step })
        }, settings)
        .then(() => {
          if (live()) dispatch({ type: 'PREP_DONE' })
        })
        .catch((cause: unknown) => {
          if (live()) fail('Não consegui preparar este computador.', cause)
        })
    }

    if (prev.screen === 'approve' && next.screen === 'ready') {
      const answer = event.type === 'APPROVE' ? engine.approve() : engine.deny()
      answer.catch((cause: unknown) => fail('Não consegui responder ao pedido.', cause))
    }

    if (
      prev.screen === 'connected' &&
      next.screen !== 'connected' &&
      event.type !== 'CLIENT_DISCONNECTED'
    ) {
      engine.stopSending().catch((cause: unknown) => fail('Não consegui parar o envio.', cause))
    }

    if (next.screen === 'receiving' && prev.screen !== 'receiving') {
      engine.connect(next.host, settings).catch((cause: unknown) => {
        if (state.screen === 'receiving') fail('Não consegui conectar a esse computador.', cause)
      })
    }

    if (
      prev.screen === 'receiving' &&
      next.screen !== 'receiving' &&
      event.type !== 'STREAM_ENDED'
    ) {
      engine.disconnect().catch((cause: unknown) => fail('Não consegui encerrar a conexão.', cause))
    }
  }

  function dispatch(event: AppEvent): void {
    const prev = state
    const next = reduce(prev, event)
    if (next === prev) return
    state = next
    notify()
    runEffects(prev, next, event)
  }

  engine.onPairRequest((device) => dispatch({ type: 'PAIR_REQUEST', device }))
  engine.onClientConnected((device) => dispatch({ type: 'CLIENT_CONNECTED', device }))
  engine.onClientDisconnected(() => dispatch({ type: 'CLIENT_DISCONNECTED' }))
  engine.onStreamEnded(() => dispatch({ type: 'STREAM_ENDED' }))

  return {
    getSnapshot: snapshot,
    dispatch,
    async updateSettings(patch) {
      settings = parseSettings({ ...settings, ...patch })
      await store.save(settings)
      notify()
      if (state.screen === 'connected' || state.screen === 'receiving') {
        // Ajuste ao vivo é melhor esforço: se falhar, a conexão segue com o valor anterior.
        await engine.applyBitrate(settings.bitrate).catch(() => undefined)
      }
      return settings
    },
    listHosts: () => engine.listHosts(),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
