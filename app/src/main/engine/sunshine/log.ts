export interface SunshineDisplay {
  deviceId: string
  displayName: string
  friendlyName: string
  width: number
  height: number
  primary: boolean
  originX: number
}

export interface FoundEncoder {
  name: string
  backend: string
  hardware: boolean
}

const ENCODER_TEST_MARKER = 'Testing for available encoders'
const DISPLAY_MARKER = 'Currently available display devices:'
const STARTUP_MARKER = 'Configuration UI available at'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Resultado do último teste de encoders do log (um log pode ter várias execuções). */
export function parseFoundEncoder(log: string): FoundEncoder | null {
  const start = log.lastIndexOf(ENCODER_TEST_MARKER)
  if (start < 0) return null
  const match = /Found H\.264 encoder: (\S+) \[(\w+)\]/.exec(log.slice(start))
  if (!match) return null
  const [, name, backend] = match
  if (name === undefined || backend === undefined) return null
  return { name, backend, hardware: backend !== 'software' }
}

export function parseDisplays(log: string): SunshineDisplay[] {
  const marker = log.lastIndexOf(DISPLAY_MARKER)
  if (marker < 0) return []
  const rest = log.slice(marker + DISPLAY_MARKER.length)
  const open = rest.indexOf('\n[')
  if (open < 0) return []
  const close = rest.indexOf('\n]', open + 1)
  if (close < 0) return []

  let data: unknown
  try {
    data = JSON.parse(rest.slice(open + 1, close + 2))
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  return data.flatMap((item: unknown): SunshineDisplay[] => {
    if (!isRecord(item) || typeof item.device_id !== 'string') return []
    const info = isRecord(item.info) ? item.info : {}
    const resolution = isRecord(info.resolution) ? info.resolution : {}
    const origin = isRecord(info.origin_point) ? info.origin_point : {}
    return [
      {
        deviceId: item.device_id,
        displayName: typeof item.display_name === 'string' ? item.display_name : '',
        friendlyName: typeof item.friendly_name === 'string' ? item.friendly_name : '',
        width: typeof resolution.width === 'number' ? resolution.width : 0,
        height: typeof resolution.height === 'number' ? resolution.height : 0,
        primary: info.primary === true,
        originX: typeof origin.x === 'number' ? origin.x : 0
      }
    ]
  })
}

export const isStartupComplete = (log: string): boolean => log.includes(STARTUP_MARKER)

export const countStartups = (log: string): number => log.split(STARTUP_MARKER).length - 1

/** Primeira linha do log: muda a cada execução do Sunshine (traz a hora e a versão). */
export const logSignature = (log: string): string => (log.split(/\r?\n/, 1)[0] ?? '').slice(0, 160)

export function countSessionEvents(log: string): { connected: number; disconnected: number } {
  return {
    connected: (log.match(/: CLIENT CONNECTED[ \t]*\r?$/gm) ?? []).length,
    disconnected: (log.match(/: CLIENT DISCONNECTED[ \t]*\r?$/gm) ?? []).length
  }
}
