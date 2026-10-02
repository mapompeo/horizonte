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
    case 'APPROVE':
    case 'DENY':
    case 'STOP':
    case 'RETRY':
      return true
    case 'CHOOSE':
      return candidate.mode === 'send' || candidate.mode === 'receive'
    case 'CONNECT':
      return typeof candidate.host === 'string' && candidate.host.length > 0
    default:
      return false
  }
}
