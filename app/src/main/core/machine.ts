import { isValidPin } from '../../shared/pin'
import type { AppEvent, AppState, Mode } from '../../shared/types'

type ApproveState = Extract<AppState, { screen: 'approve' }>
type ApproveEvent = Extract<AppEvent, { type: 'APPROVE' }>

/** O PIN digitado vale mais que o já conhecido; qualquer um precisa ter 4 dígitos. */
export function approvalPin(state: ApproveState, event: ApproveEvent): string | null {
  const pin = event.pin ?? state.pin
  return pin !== null && isValidPin(pin) ? pin : null
}

function startFor(mode: Mode): AppState {
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
      return event.type === 'INSTALL_DONE' ? { screen: 'choose' } : state
    case 'choose':
      return state
    case 'preparing':
      if (event.type === 'PREP_STEP') return { ...state, step: event.step }
      if (event.type === 'PREP_DONE') return { screen: 'ready', mode: 'send' }
      return state
    case 'ready':
      if (event.type === 'PAIR_REQUEST') {
        const pin = event.pin !== undefined && isValidPin(event.pin) ? event.pin : null
        return {
          screen: 'approve',
          mode: 'send',
          device: event.device,
          pairingId: event.pairingId,
          pin
        }
      }
      if (event.type === 'CLIENT_CONNECTED')
        return { screen: 'connected', mode: 'send', device: event.device }
      return state
    case 'approve':
      if (event.type === 'APPROVE') {
        return approvalPin(state, event) === null ? state : { screen: 'ready', mode: 'send' }
      }
      if (event.type === 'DENY') return { screen: 'ready', mode: 'send' }
      if (event.type === 'PAIR_CANCELLED') {
        return event.pairingId === state.pairingId ? { screen: 'ready', mode: 'send' } : state
      }
      return state
    case 'connected':
      return event.type === 'CLIENT_DISCONNECTED' || event.type === 'STOP'
        ? { screen: 'ready', mode: 'send' }
        : state
    case 'discover':
      return event.type === 'CONNECT'
        ? { screen: 'receiving', mode: 'receive', host: event.host, name: event.name }
        : state
    case 'receiving':
      return event.type === 'STREAM_ENDED' || event.type === 'STOP'
        ? { screen: 'discover', mode: 'receive' }
        : state
    case 'error':
      return event.type === 'RETRY' ? startFor(state.mode) : state
  }
}
