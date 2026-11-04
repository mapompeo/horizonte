import { isValidPin } from '../../shared/pin'
import type { AppEvent, AppState, ConnectedDevice, Mode } from '../../shared/types'

type ApproveState = Extract<AppState, { screen: 'approve' }>
type ApproveEvent = Extract<AppEvent, { type: 'APPROVE' }>
type PairEvent = Extract<AppEvent, { type: 'PAIR_REQUEST' }>
type ConnectedEvent = Extract<AppEvent, { type: 'CLIENT_CONNECTED' }>

const deviceOf = (event: ConnectedEvent): ConnectedDevice => ({
  device: event.device,
  ...(event.fingerprint ? { fingerprint: event.fingerprint } : {}),
  ...(event.screen ? { peerScreen: event.screen } : {})
})

/** O mesmo aparelho conectando de novo fica no lugar dele na lista. */
const added = (list: ConnectedDevice[], device: ConnectedDevice): ConnectedDevice[] =>
  device.fingerprint && list.some((d) => d.fingerprint === device.fingerprint)
    ? list.map((d) => (d.fingerprint === device.fingerprint ? device : d))
    : [...list, device]

/** Sem a impressão digital, saem todos (o motor antigo não diz quem saiu). */
const removed = (list: ConnectedDevice[], fingerprint?: string): ConnectedDevice[] =>
  fingerprint ? list.filter((d) => d.fingerprint !== fingerprint) : []

const withDevices = (devices: ConnectedDevice[]): AppState =>
  devices.length > 0
    ? { screen: 'connected', mode: 'send', devices }
    : { screen: 'ready', mode: 'send' }

function asking(event: PairEvent, connected: ConnectedDevice[]): AppState {
  const pin = event.pin !== undefined && isValidPin(event.pin) ? event.pin : null
  return {
    screen: 'approve',
    mode: 'send',
    device: event.device,
    pairingId: event.pairingId,
    pin,
    ...(event.address ? { address: event.address } : {}),
    ...(event.fingerprint ? { fingerprint: event.fingerprint } : {}),
    ...(event.deviceId ? { deviceId: event.deviceId } : {}),
    ...(event.screen ? { peerScreen: event.screen } : {}),
    ...(connected.length > 0 ? { connected } : {})
  }
}

/** O PIN digitado vale mais que o já conhecido; qualquer um precisa ter 4 dígitos. */
export function approvalPin(state: ApproveState, event: ApproveEvent): string | null {
  const pin = event.pin ?? state.pin
  return pin !== null && isValidPin(pin) ? pin : null
}

function startFor(mode: Mode): AppState {
  if (mode === 'mouse') return { screen: 'mouse', mode: 'mouse' }
  return mode === 'send'
    ? { screen: 'preparing', mode: 'send', step: 'engine' }
    : { screen: 'discover', mode: 'receive' }
}

function modeOf(state: AppState): Mode | null {
  return 'mode' in state ? state.mode : null
}

/** Função pura: devolve o mesmo objeto de `state` quando o evento não se aplica. */
export function reduce(state: AppState, event: AppEvent): AppState {
  if (event.type === 'FAIL') {
    return { screen: 'error', mode: modeOf(state) ?? 'send', error: event.error }
  }

  if (event.type === 'CHOOSE') {
    if (state.screen === 'install') return state
    if (state.screen === 'choose') return startFor(event.mode)
    return modeOf(state) === event.mode ? state : startFor(event.mode)
  }

  switch (state.screen) {
    case 'install':
      // Começar só leva à escolha: o motor de envio é preparado se (e quando) a pessoa escolher Enviar.
      // Quem só vai receber a tela não instala nada nem vê pedido de administrador.
      return event.type === 'INSTALL_DONE' ? { screen: 'choose' } : state
    case 'choose':
      return state
    case 'preparing':
      if (event.type === 'PREP_STEP') {
        // O texto da etapa anterior sai, mas a barra não volta.
        const kept = state.progress ? { note: '', fraction: state.progress.fraction } : undefined
        return {
          screen: 'preparing',
          mode: 'send',
          step: event.step,
          progress: kept
        }
      }
      if (event.type === 'PREP_PROGRESS') {
        // A barra só anda para frente: um aviso atrasado não pode fazê-la voltar.
        const before = state.progress?.fraction ?? 0
        return {
          ...state,
          progress: { ...event.progress, fraction: Math.max(before, event.progress.fraction) }
        }
      }
      if (event.type === 'PREP_DONE') {
        return { screen: 'ready', mode: 'send' }
      }
      return state
    case 'ready':
      if (event.type === 'PAIR_REQUEST') return asking(event, [])
      if (event.type === 'CLIENT_CONNECTED') return withDevices([deviceOf(event)])
      return state
    case 'approve': {
      // Quem já estava conectado continua: a resposta volta para a lista deles (ou para "pronto", sem ninguém).
      const back = withDevices(state.connected ?? [])
      if (event.type === 'APPROVE') {
        // Motor próprio: sem PIN, a identidade vem pelo certificado.
        if (state.fingerprint) return back
        return approvalPin(state, event) === null ? state : back
      }
      if (event.type === 'DENY') return back
      if (event.type === 'PAIR_CANCELLED') return event.pairingId === state.pairingId ? back : state
      // Outro aparelho confiável conectou (ou saiu) enquanto a pessoa responde: a lista anda junto.
      if (event.type === 'CLIENT_CONNECTED')
        return { ...state, connected: added(state.connected ?? [], deviceOf(event)) }
      if (event.type === 'CLIENT_DISCONNECTED')
        return { ...state, connected: removed(state.connected ?? [], event.fingerprint) }
      return state
    }
    case 'connected':
      if (event.type === 'CLIENT_CONNECTED')
        return withDevices(added(state.devices, deviceOf(event)))
      if (event.type === 'CLIENT_DISCONNECTED' || event.type === 'STOP')
        return withDevices(removed(state.devices, event.fingerprint))
      if (event.type === 'PAIR_REQUEST') return asking(event, state.devices)
      return state
    case 'discover':
      return event.type === 'CONNECT'
        ? { screen: 'receiving', mode: 'receive', host: event.host, name: event.name }
        : state
    case 'receiving':
      return event.type === 'STREAM_ENDED' || event.type === 'STOP'
        ? { screen: 'discover', mode: 'receive' }
        : state
    case 'mouse':
      if (event.type === 'MOUSE_SHARE')
        return {
          screen: 'mouse-active',
          mode: 'mouse',
          device: event.peers.map((peer) => peer.name).join(' e '),
          role: 'share'
        }
      if (event.type === 'MOUSE_REQUEST')
        return {
          screen: 'mouse-request',
          mode: 'mouse',
          device: event.device,
          address: event.address
        }
      return state
    case 'mouse-request':
      if (event.type === 'MOUSE_ACCEPT')
        return { screen: 'mouse-active', mode: 'mouse', device: state.device, role: 'follow' }
      return event.type === 'MOUSE_DENY' || event.type === 'MOUSE_ENDED'
        ? { screen: 'mouse', mode: 'mouse' }
        : state
    case 'mouse-active':
      return event.type === 'STOP' || event.type === 'MOUSE_ENDED'
        ? { screen: 'mouse', mode: 'mouse' }
        : state
    case 'error':
      return event.type === 'RETRY' ? startFor(state.mode) : state
  }
}
