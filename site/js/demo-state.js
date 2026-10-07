/** O app da página, com a mesma lógica da versão atual do Horizonte (telas, textos, ajustes e qualidade). */

export const BITRATE_STEPS = [5, 10, 15, 20, 30, 40, 50, 60, 80]
export const PROFILES = { economico: 10, equilibrado: 30, maximo: 60 }
export const HOST = { name: 'Desktop', address: '192.168.1.5' }
export const DEVICE = 'Notebook'

export function stepBitrate(current, direction) {
  const value = Math.min(80, Math.max(5, Math.round(current)))
  if (direction === 1) return BITRATE_STEPS.find((s) => s > value) ?? 80
  return [...BITRATE_STEPS].reverse().find((s) => s < value) ?? 5
}

export function profileOf(bitrate) {
  return Object.entries(PROFILES).find(([, mbps]) => mbps === bitrate)?.[0] ?? null
}

export function isHostAddress(text) {
  const parts = text.trim().split('.')
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

export function initialState() {
  return {
    mode: 'send',
    screen: 'ready',
    back: 'ready',
    bitrate: 30,
    web: false,
    manual: false,
    settings: { autostart: false, resolution: '1080p', fps: 60, encoding: 'auto', codec: 'h264' }
  }
}

const idle = (mode) => (mode === 'send' ? 'ready' : 'discover')

/** Um passo da máquina: devolve um estado novo e nunca altera o anterior. */
export function reduce(state, action) {
  switch (action.type) {
    case 'MODE':
      if (state.screen === 'settings') return { ...state, mode: action.mode, back: idle(action.mode) }
      return { ...state, mode: action.mode, screen: idle(action.mode), web: false, manual: false }
    case 'OPEN_SETTINGS':
      return state.screen === 'settings' ? state : { ...state, screen: 'settings', back: state.screen }
    case 'CLOSE_SETTINGS':
      return state.screen === 'settings' ? { ...state, screen: state.back } : state
    case 'REQUEST':
      // Um aparelho pede para conectar: só vale esperando conexão.
      return state.screen === 'ready' ? { ...state, screen: 'approve' } : state
    case 'APPROVE':
      return state.screen === 'approve' ? { ...state, screen: 'connected' } : state
    case 'DENY':
      return state.screen === 'approve' ? { ...state, screen: 'ready' } : state
    case 'STOP':
      return state.screen === 'connected' || state.screen === 'receiving'
        ? { ...state, screen: idle(state.mode), manual: false }
        : state
    case 'EXTEND':
      return state.screen === 'discover' ? { ...state, screen: 'receiving' } : state
    case 'MANUAL':
      return state.screen === 'discover' ? { ...state, manual: true } : state
    case 'WEB':
      return state.screen === 'ready' ? { ...state, web: !state.web } : state
    case 'BITRATE':
      return { ...state, bitrate: Math.min(80, Math.max(5, Math.round(action.mbps))) }
    case 'STEP':
      return { ...state, bitrate: stepBitrate(state.bitrate, action.direction) }
    case 'SETTING':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } }
    default:
      return state
  }
}
