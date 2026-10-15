import { isHostAddress } from './address'
import { isValidPin } from './pin'
import type { AppEvent, Host } from './types'

/**
 * Eventos que a interface pode mandar ao processo principal.
 * Os demais (pareamento, conexão, fim de preparação, erro) só nascem do motor.
 */
export function isUiEvent(value: unknown): value is AppEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  switch (candidate.type) {
    case 'INSTALL_DONE':
    case 'DENY':
    case 'STOP':
    case 'RETRY':
      return true
    case 'APPROVE':
      return (
        (candidate.pin === undefined || isValidPin(candidate.pin)) &&
        (candidate.trust === undefined || typeof candidate.trust === 'boolean')
      )
    case 'MOUSE_ACCEPT':
    case 'MOUSE_DENY':
      return true
    case 'MOUSE_SHARE':
      return (
        Array.isArray(candidate.peers) &&
        candidate.peers.length > 0 &&
        candidate.peers.length <= 8 &&
        candidate.peers.every(
          (peer: unknown) =>
            typeof peer === 'object' &&
            peer !== null &&
            typeof (peer as Host).address === 'string' &&
            isHostAddress((peer as Host).address) &&
            typeof (peer as Host).name === 'string' &&
            (peer as Host).name.length <= 200
        )
      )
    case 'CHOOSE':
      return candidate.mode === 'send' || candidate.mode === 'receive' || candidate.mode === 'mouse'
    case 'CONNECT':
      return (
        typeof candidate.host === 'string' &&
        isHostAddress(candidate.host) &&
        typeof candidate.name === 'string' &&
        candidate.name.length <= 200
      )
    default:
      return false
  }
}
