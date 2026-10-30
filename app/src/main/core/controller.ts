import type {
  AppEvent,
  AppState,
  Host,
  Settings,
  SettingsPatch,
  Snapshot,
  TrustedDevice
} from '../../shared/types'
import type { EnginePort, MouseEngine, MousePlacement } from '../engine/port'
import { isValidPin } from '../../shared/pin'
import { approvalPin, reduce } from './machine'
import { parseSettings, type SettingsStore } from './settings'

export interface ControllerDeps {
  engine: EnginePort
  /** Sem ele, o modo Mouse mostra que não está disponível neste sistema. */
  mouse?: MouseEngine
  store: SettingsStore
  initial?: AppState
}

export interface Controller {
  getSnapshot(): Snapshot
  dispatch(event: AppEvent): void
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  listMousePeers(): Promise<Host[]>
  subscribe(listener: (snapshot: Snapshot) => void): () => void
}

/** Telas do modo enviar em que o motor está preparando ou esperando, sem conexão ainda. */
const isSendIdle = (state: AppState): boolean =>
  state.screen === 'preparing' || state.screen === 'ready' || state.screen === 'approve'

const isSendLive = (state: AppState): boolean => isSendIdle(state) || state.screen === 'connected'

function startFor(mode: Settings['mode']): AppState {
  if (mode === 'send') return { screen: 'preparing', mode: 'send', step: 'engine' }
  if (mode === 'receive') return { screen: 'discover', mode: 'receive' }
  if (mode === 'mouse') return { screen: 'mouse', mode: 'mouse' }
  return { screen: 'install' }
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export async function createController({
  engine,
  mouse,
  store,
  initial
}: ControllerDeps): Promise<Controller> {
  let settings = await store.load()
  /** Depois da primeira vez o app abre direto no último modo, sem a tela de começar. */
  let state: AppState = initial ?? startFor(settings.mode)
  /** Cada preparação recebe um número; só a mais recente pode mexer no estado. */
  let prepareRun = 0
  /** Pedidos de pareamento que chegaram com a tela ocupada (outro pedido ou uma conexão). */
  let queuedPairs: Extract<AppEvent, { type: 'PAIR_REQUEST' }>[] = []
  const listeners = new Set<(snapshot: Snapshot) => void>()
  let settingsQueue: Promise<unknown> = Promise.resolve()

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

  /** Computadores com quem este PC está compartilhando o mouse (para mudar a posição durante o uso). */
  let sharingWith: Host[] = []

  /** Onde cada um fica, pelos ajustes (sem lado salvo: à direita). */
  const placementsFor = (hosts: Host[]): MousePlacement[] =>
    hosts.map((host) => ({
      host,
      side: settings.mouseSides[host.name] ?? 'right',
      offset: settings.mouseOffsets[host.name]
    }))

  function runMouseEffects(prev: AppState, next: AppState, event: AppEvent): void {
    const wasMouse = 'mode' in prev && prev.mode === 'mouse'
    const isMouse = 'mode' in next && next.mode === 'mouse'
    if (!mouse) {
      if (isMouse && !wasMouse)
        fail('O compartilhamento de mouse ainda não está disponível neste sistema.', '')
      return
    }
    if (isMouse && !wasMouse) {
      mouse.start(settings.deviceName).catch(failIfStill(next, 'Não consegui ligar o modo Mouse.'))
    }
    if (wasMouse && !isMouse) mouse.stop().catch(() => undefined)
    if (next.screen === 'mouse-active' && prev.screen === 'mouse' && event.type === 'MOUSE_SHARE') {
      sharingWith = event.peers
      mouse
        .share(placementsFor(event.peers), settings.deviceName)
        .catch(failIfStill(next, 'Não consegui compartilhar o mouse.'))
    }
    if (prev.screen === 'mouse-request') {
      if (event.type === 'MOUSE_ACCEPT') {
        mouse
          .accept(settings.deviceName)
          .catch(failIfStill(next, 'Não consegui me conectar ao mouse do outro computador.'))
      } else if (event.type === 'MOUSE_DENY') mouse.deny().catch(() => undefined)
    }
    if (
      prev.screen === 'mouse-active' &&
      next.screen !== 'mouse-active' &&
      event.type !== 'MOUSE_ENDED'
    ) {
      mouse.end().catch(() => undefined)
    }
  }

  function runEffects(prev: AppState, next: AppState, event: AppEvent): void {
    runMouseEffects(prev, next, event)
    // Sair da preparação por qualquer caminho abandona a execução em andamento.
    if (prev.screen === 'preparing' && next.screen !== 'preparing') prepareRun++

    if (next.screen === 'preparing' && prev.screen !== 'preparing') {
      const run = ++prepareRun
      const live = (): boolean => run === prepareRun
      engine
        .prepare(
          (step) => {
            if (live()) dispatch({ type: 'PREP_STEP', step })
          },
          settings,
          (progress) => {
            if (live()) dispatch({ type: 'PREP_PROGRESS', progress })
          }
        )
        .then(() => {
          if (live()) dispatch({ type: 'PREP_DONE' })
        })
        .catch((cause: unknown) => {
          if (live()) fail('Não consegui preparar este dispositivo.', cause)
        })
    }

    // Saiu do modo enviar sem ter conectado: o motor precisa parar de preparar ou de esperar.
    if (isSendIdle(prev) && !isSendLive(next)) {
      engine.abort().catch(() => undefined) // melhor esforço, o usuário já saiu daquela tela
    }

    if (prev.screen === 'approve' && next.screen === 'ready') {
      if (event.type === 'APPROVE') {
        const pin = approvalPin(prev, event)
        if (pin !== null || prev.fingerprint) {
          engine
            .approve({
              pairingId: prev.pairingId,
              ...(pin !== null ? { pin } : {}),
              name: prev.device
            })
            .catch(failIfStill(next, 'Não consegui responder ao pedido.'))
        }
        if (event.trust && prev.address)
          trust({
            name: prev.device,
            address: prev.address,
            ...(prev.fingerprint ? { fingerprint: prev.fingerprint } : {}),
            ...(prev.deviceId ? { deviceId: prev.deviceId } : {})
          })
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
    if (event.type === 'CHOOSE') {
      settings = { ...settings, mode: event.mode }
      settingsQueue = settingsQueue.then(() => store.save(settings)).catch(() => undefined) // lembrar o modo é só conveniência
    }
    notify()
    runEffects(prev, next, event)
    if (!isSendLive(next)) queuedPairs = []
    else if (next.screen === 'ready') {
      const queued = queuedPairs.shift()
      if (queued !== undefined) dispatch(queued)
    }
  }

  /**
   * Lembra o aparelho: o próximo pedido dele é aprovado sozinho (pelo certificado, no motor próprio; pelo nome e
   * endereço, no antigo). A entrada antiga do mesmo aparelho sai.
   */
  function trust(device: TrustedDevice): void {
    const others = settings.trusted.filter(
      (known) =>
        (known.name !== device.name || known.address !== device.address) &&
        (!device.fingerprint || known.fingerprint !== device.fingerprint)
    )
    settings = {
      ...parseSettings({ ...settings, trusted: [device, ...others] }),
      mode: settings.mode
    }
    notify()
    settingsQueue = settingsQueue.then(() => store.save(settings)).catch(() => undefined)
  }

  const isTrusted = (request: {
    device: string
    address?: string
    fingerprint?: string
  }): boolean =>
    request.fingerprint
      ? settings.trusted.some((known) => known.fingerprint === request.fingerprint)
      : settings.trusted.some(
          (known) =>
            !known.fingerprint && known.name === request.device && known.address === request.address
        )

  function onPairRequest(request: {
    device: string
    pairingId: string
    pin?: string
    address?: string
    fingerprint?: string
    deviceId?: string
  }): void {
    const event = { type: 'PAIR_REQUEST', ...request } as const
    // Aparelho confiável (pelo certificado, ou com o PIN do Horizonte no motor antigo): aprova sem mostrar o pedido.
    // Se falhar, mostra como sempre.
    const verified = request.fingerprint || (request.pin && isValidPin(request.pin))
    if (state.screen === 'ready' && verified && isTrusted(request)) {
      engine
        .approve({
          pairingId: request.pairingId,
          ...(request.pin ? { pin: request.pin } : {}),
          name: request.device
        })
        .catch(() => dispatch(event))
      return
    }
    if (state.screen !== 'approve' && state.screen !== 'connected') return dispatch(event)
    // O vigia já marcou este pedido como conhecido e não o anuncia de novo: guardamos para a vez dele.
    const shown = state.screen === 'approve' && state.pairingId === request.pairingId
    if (!shown && !queuedPairs.some((queued) => queued.pairingId === request.pairingId)) {
      queuedPairs.push(event)
    }
  }

  engine.onPairRequest(onPairRequest)
  engine.onPairCancelled((pairingId) => {
    queuedPairs = queuedPairs.filter((queued) => queued.pairingId !== pairingId)
    dispatch({ type: 'PAIR_CANCELLED', pairingId })
  })
  engine.onClientConnected((device) => dispatch({ type: 'CLIENT_CONNECTED', device }))
  engine.onClientDisconnected(() => dispatch({ type: 'CLIENT_DISCONNECTED' }))
  engine.onStreamEnded(() => dispatch({ type: 'STREAM_ENDED' }))
  mouse?.onRequest((request) => dispatch({ type: 'MOUSE_REQUEST', ...request }))
  mouse?.onEnded(() => dispatch({ type: 'MOUSE_ENDED' }))

  // Abrindo direto em enviar não há transição para disparar a preparação: começa aqui.
  if (state.screen === 'preparing')
    runEffects({ screen: 'choose' }, state, { type: 'CHOOSE', mode: 'send' })
  // Abrindo direto no modo Mouse, o mesmo: anuncia este PC e escuta pedidos.
  if (state.screen === 'mouse')
    runEffects({ screen: 'choose' }, state, { type: 'CHOOSE', mode: 'mouse' })

  return {
    getSnapshot: snapshot,
    dispatch,
    updateSettings(patch) {
      const update = settingsQueue.then(async () => {
        const next = parseSettings({ ...settings, ...patch })
        const moved = next.extendSide !== settings.extendSide
        const sharing = state.screen === 'mouse-active' && state.role === 'share'
        const mouseMoved =
          sharing &&
          sharingWith.some(
            ({ name }) =>
              next.mouseSides[name] !== settings.mouseSides[name] ||
              next.mouseOffsets[name] !== settings.mouseOffsets[name]
          )
        await store.save(next)
        settings = { ...next, mode: settings.mode }
        notify()
        if (moved) await engine.placeDisplay?.(settings.extendSide).catch(() => undefined)
        if (mouseMoved) await mouse?.setLayout(placementsFor(sharingWith)).catch(() => undefined)
        if (state.screen === 'connected' || state.screen === 'receiving') {
          // Ajuste ao vivo é melhor esforço: se falhar, a conexão segue com o valor anterior.
          await engine.applyBitrate(settings.bitrate).catch(() => undefined)
        }
        return settings
      })
      settingsQueue = update.catch(() => undefined)
      return update
    },
    listHosts: () => engine.listHosts(),
    listMousePeers: async () => (mouse ? mouse.listPeers() : []),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
