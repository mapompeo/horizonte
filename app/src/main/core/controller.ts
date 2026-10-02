import type {
  AppEvent,
  AppState,
  Host,
  Settings,
  SettingsPatch,
  Snapshot
} from '../../shared/types'
import type { EnginePort } from '../engine/port'
import { approvalPin, reduce } from './machine'
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

/** Telas do modo enviar em que o motor está preparando ou esperando, sem conexão ainda. */
const isSendIdle = (state: AppState): boolean =>
  state.screen === 'preparing' || state.screen === 'ready' || state.screen === 'approve'

const isSendLive = (state: AppState): boolean => isSendIdle(state) || state.screen === 'connected'

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
    // Um erro novo não apaga o que já está na tela: o primeiro costuma ser a causa.
    if (state.screen === 'error') return
    dispatch({ type: 'FAIL', error: { message, detail: describeError(cause) } })
  }

  /** A falha de uma operação só importa se o usuário ainda está na tela a que ela levou. */
  function failIfStill(target: AppState, message: string): (cause: unknown) => void {
    return (cause) => {
      if (state === target && target.screen !== 'error') fail(message, cause)
    }
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

    // Saiu do modo enviar sem ter conectado: o motor precisa parar de preparar ou de esperar.
    if (isSendIdle(prev) && !isSendLive(next)) {
      engine.abort().catch(() => undefined) // melhor esforço, o usuário já saiu daquela tela
    }

    if (prev.screen === 'approve' && next.screen === 'ready') {
      if (event.type === 'APPROVE') {
        const pin = approvalPin(prev, event)
        if (pin !== null) {
          engine
            .approve({ pairingId: prev.pairingId, pin, name: prev.device })
            .catch(failIfStill(next, 'Não consegui responder ao pedido.'))
        }
      } else if (event.type === 'DENY') {
        engine.deny(prev.pairingId).catch(failIfStill(next, 'Não consegui responder ao pedido.'))
      }
    }

    if (
      prev.screen === 'connected' &&
      next.screen !== 'connected' &&
      event.type !== 'CLIENT_DISCONNECTED'
    ) {
      engine.stopSending().catch(failIfStill(next, 'Não consegui parar o envio.'))
    }

    if (next.screen === 'receiving' && prev.screen !== 'receiving') {
      engine
        .connect(next.host, settings)
        .catch(failIfStill(next, 'Não consegui conectar a esse computador.'))
    }

    if (
      prev.screen === 'receiving' &&
      next.screen !== 'receiving' &&
      event.type !== 'STREAM_ENDED'
    ) {
      engine.disconnect().catch(failIfStill(next, 'Não consegui encerrar a conexão.'))
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

  engine.onPairRequest((request) => dispatch({ type: 'PAIR_REQUEST', ...request }))
  engine.onPairCancelled((pairingId) => dispatch({ type: 'PAIR_CANCELLED', pairingId }))
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
