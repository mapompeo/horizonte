import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { cleanName } from '../../shared/names'
import { clampBitrate, profileFor } from '../../shared/quality'
import { isHostAddress } from '../../shared/address'
import type {
  Codec,
  Encoding,
  ExtendSide,
  Fps,
  Resolution,
  Settings,
  TrustedDevice
} from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  profile: 'equilibrado',
  bitrate: 30,
  resolution: '1080p',
  fps: 60,
  encoding: 'auto',
  codec: 'h264',
  autostart: true,
  deviceName: 'Dispositivo',
  extendSide: 'right',
  mouseSides: {},
  mouseOffsets: {},
  trusted: [],
  mode: null
}

const LEGACY_DEFAULT_NAMES = ['Computador']

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Até 20 computadores, cada um com um lado válido; o resto é descartado. */
function parseMouseSides(raw: unknown): Record<string, ExtendSide> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (entry): entry is [string, ExtendSide] =>
      entry[0].length > 0 &&
      entry[0].length <= 200 &&
      (entry[1] === 'left' || entry[1] === 'right' || entry[1] === 'above')
  )
  return Object.fromEntries(entries.slice(0, 20))
}

/** Até 20 computadores, cada um com uma posição entre -2 e 2 (fração da borda); o resto é descartado. */
function parseMouseOffsets(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (entry): entry is [string, number] =>
      entry[0].length > 0 &&
      entry[0].length <= 200 &&
      typeof entry[1] === 'number' &&
      Number.isFinite(entry[1]) &&
      Math.abs(entry[1]) <= 2
  )
  return Object.fromEntries(entries.slice(0, 20))
}

/** Até 20 aparelhos, cada um com nome limpo e endereço de verdade; o resto é descartado. */
function parseTrusted(raw: unknown): TrustedDevice[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item: unknown): TrustedDevice[] => {
      if (typeof item !== 'object' || item === null) return []
      const { name, address } = item as Record<string, unknown>
      const clean = typeof name === 'string' ? cleanName(name) : ''
      return clean && typeof address === 'string' && isHostAddress(address)
        ? [{ name: clean, address }]
        : []
    })
    .slice(0, 20)
}

/** Aceita qualquer entrada e sempre devolve ajustes válidos. */
export function parseSettings(raw: unknown, defaultName = DEFAULT_SETTINGS.deviceName): Settings {
  const input = (
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}
  ) as Record<string, unknown>
  const bitrate = clampBitrate(
    typeof input.bitrate === 'number' ? input.bitrate : DEFAULT_SETTINGS.bitrate
  )
  const saved = typeof input.deviceName === 'string' ? cleanName(input.deviceName) : ''
  // "Computador" era o nome padrão antigo, gravado sem a pessoa escolher: vale o nome do aparelho.
  const name = LEGACY_DEFAULT_NAMES.includes(saved) ? '' : saved

  return {
    bitrate,
    profile: profileFor(bitrate),
    resolution: oneOf<Resolution>(
      input.resolution,
      ['720p', '1080p', '1440p'],
      DEFAULT_SETTINGS.resolution
    ),
    fps: oneOf<Fps>(input.fps, [30, 60, 120], DEFAULT_SETTINGS.fps),
    encoding: oneOf<Encoding>(input.encoding, ['auto', 'gpu', 'cpu'], DEFAULT_SETTINGS.encoding),
    codec: oneOf<Codec>(input.codec, ['h264', 'hevc', 'av1'], DEFAULT_SETTINGS.codec),
    autostart: typeof input.autostart === 'boolean' ? input.autostart : DEFAULT_SETTINGS.autostart,
    trusted: parseTrusted(input.trusted),
    extendSide: oneOf<ExtendSide>(
      input.extendSide,
      ['left', 'right', 'above'],
      DEFAULT_SETTINGS.extendSide
    ),
    mouseSides: parseMouseSides(input.mouseSides),
    mouseOffsets: parseMouseOffsets(input.mouseOffsets),
    deviceName: name || defaultName,
    mode:
      input.mode === 'send' || input.mode === 'receive' || input.mode === 'mouse'
        ? input.mode
        : null
  }
}

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
}

/** `defaultName` é o nome do próprio aparelho (ex.: o nome do computador no Windows), usado até a pessoa escolher outro. */
export function createSettingsStore(
  file: string,
  defaultName = DEFAULT_SETTINGS.deviceName
): SettingsStore {
  /** Gravações entram em fila: cada uma espera a anterior, e a última chamada é a que vale. */
  let queue: Promise<void> = Promise.resolve()
  let counter = 0

  return {
    async load() {
      try {
        return parseSettings(JSON.parse(await readFile(file, 'utf8')), defaultName)
      } catch {
        return { ...DEFAULT_SETTINGS, deviceName: defaultName }
      }
    },
    save(settings) {
      const write = async (): Promise<void> => {
        await mkdir(dirname(file), { recursive: true })
        const temporary = `${file}.${process.pid}.${counter++}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8')
          await rename(temporary, file)
        } catch (cause) {
          await rm(temporary, { force: true })
          throw cause
        }
      }
      const run = queue.then(write)
      queue = run.catch(() => undefined)
      return run
    }
  }
}
