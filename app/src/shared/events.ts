import type { AppEvent } from './types'

/** Endereço ou nome de rede: sem espaços nem controles, para nunca virar argumento de linha de comando. */
const HOST_ADDRESS = /^[A-Za-z0-9._:%[\]-]{1,255}$/

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
      return (
        typeof candidate.host === 'string' &&
        HOST_ADDRESS.test(candidate.host) &&
        typeof candidate.name === 'string' &&
        candidate.name.length <= 200
      )
    default:
      return false
  }
}
