import type { ProfileId } from './types'

export const BITRATE_MIN = 5
export const BITRATE_MAX = 80
export const BITRATE_STEPS = [5, 10, 15, 20, 30, 40, 50, 60, 80] as const

export const PROFILES = { economico: 10, equilibrado: 30, maximo: 60 } as const

/** Entra na faixa válida, arredondando. Valores que não são número viram o padrão. */
export function clampBitrate(value: number): number {
  if (!Number.isFinite(value)) return PROFILES.equilibrado
  return Math.min(BITRATE_MAX, Math.max(BITRATE_MIN, Math.round(value)))
}

export function stepBitrate(current: number, direction: 1 | -1): number {
  const value = clampBitrate(current)
  if (direction === 1) {
    return BITRATE_STEPS.find((step) => step > value) ?? BITRATE_MAX
  }
  const lower = [...BITRATE_STEPS].reverse().find((step) => step < value)
  return lower ?? BITRATE_MIN
}

export function profileFor(bitrate: number): ProfileId {
  const value = clampBitrate(bitrate)
  if (value === PROFILES.economico) return 'economico'
  if (value === PROFILES.equilibrado) return 'equilibrado'
  if (value === PROFILES.maximo) return 'maximo'
  return 'custom'
}
