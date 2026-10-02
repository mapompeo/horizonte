import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { clampBitrate, profileFor } from '../../shared/quality'
import type { Codec, Encoding, Fps, Resolution, Settings } from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  profile: 'equilibrado',
  bitrate: 30,
  resolution: '1080p',
  fps: 60,
  encoding: 'auto',
  codec: 'h264',
  autostart: true,
  deviceName: 'Computador'
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Aceita qualquer entrada e sempre devolve ajustes válidos. */
export function parseSettings(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const bitrate = clampBitrate(typeof input.bitrate === 'number' ? input.bitrate : DEFAULT_SETTINGS.bitrate)
  const name = typeof input.deviceName === 'string' ? input.deviceName.trim().slice(0, 40) : ''

  return {
    bitrate,
    profile: profileFor(bitrate),
    resolution: oneOf<Resolution>(input.resolution, ['720p', '1080p', '1440p'], DEFAULT_SETTINGS.resolution),
    fps: oneOf<Fps>(input.fps, [30, 60, 120], DEFAULT_SETTINGS.fps),
    encoding: oneOf<Encoding>(input.encoding, ['auto', 'gpu', 'cpu'], DEFAULT_SETTINGS.encoding),
    codec: oneOf<Codec>(input.codec, ['h264', 'hevc', 'av1'], DEFAULT_SETTINGS.codec),
    autostart: typeof input.autostart === 'boolean' ? input.autostart : DEFAULT_SETTINGS.autostart,
    deviceName: name || DEFAULT_SETTINGS.deviceName
  }
}

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
}

export function createSettingsStore(file: string): SettingsStore {
  return {
    async load() {
      try {
        return parseSettings(JSON.parse(await readFile(file, 'utf8')))
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },
    async save(settings) {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.tmp`
      await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8')
      await rename(temporary, file)
    }
  }
}
