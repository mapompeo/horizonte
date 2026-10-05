import { isHostAddress } from './address'
import { isValidPin } from './pin'
import type { AppEvent } from './types'

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
      return candidate.pin === undefined || isValidPin(candidate.pin)
    case 'CHOOSE':
      return candidate.mode === 'send' || candidate.mode === 'receive'
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
