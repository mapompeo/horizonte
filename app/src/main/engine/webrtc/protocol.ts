import { isDeviceKind, type DeviceKind } from '../../../shared/device'
import { cleanName } from '../../../shared/names'
import type { ScreenSize } from '../../../shared/types'

/** Versão do protocolo de sinalização; aparelhos com outra versão não conversam. */
export const PROTOCOL_VERSION = 1
/** Primeira porta TCP da sinalização; se estiver ocupada, as próximas até `SIGNALING_PORT_LAST`. */
export const SIGNALING_PORT = 47910
export const SIGNALING_PORT_LAST = 47919
/** Uma mensagem por linha; um SDP tem uns 5 KiB, então isso sobra. */
export const MAX_LINE_BYTES = 64 * 1024

export type ByeReason = 'user' | 'error' | 'quit'
export type DenyReason = 'user' | 'busy' | 'version'

export interface Hello {
  t: 'hello'
  v: number
  id: string
  name: string
  kind: DeviceKind
  /** Impressão digital SHA-256 do certificado DTLS, como no SDP (`AB:CD:...`). */
  fp: string
  screen?: ScreenSize
}

/** O que quem mostra pede para a sessão. */
export interface Want {
  t: 'want'
  width: number
  height: number
  fps: number
  /** Em Mbps. */
  bitrate: number
  /** Codecs que quem mostra decodifica, como `video/H264`, na ordem que prefere. */
  codecs: string[]
}

export type Message =
  | Hello
  | { t: 'pending' }
  | { t: 'accepted'; trusted: boolean }
  | { t: 'denied'; reason: DenyReason }
  | { t: 'cancel' }
  | Want
  | { t: 'offer'; sdp: string }
  | { t: 'answer'; sdp: string }
  | { t: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }
  | { t: 'bitrate'; mbps: number }
  | { t: 'bye'; reason: ByeReason }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
const DEVICE_ID = /^[0-9a-f-]{8,64}$/
const MIME = /^video\/[A-Za-z0-9-]{2,16}$/
const MAX_SDP = 32 * 1024

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isInt = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
const isNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

export const isFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && FINGERPRINT.test(value)

function parseScreen(value: unknown): ScreenSize | undefined | null {
  if (value === undefined) return undefined
  if (!isObject(value) || !isInt(value.width, 1, 32768) || !isInt(value.height, 1, 32768))
    return null
  return { width: value.width, height: value.height }
}

function parseHello(raw: Record<string, unknown>): Hello | null {
  const { v, id, name, kind, fp } = raw
  if (!isInt(v, 1, 1000) || typeof id !== 'string' || !DEVICE_ID.test(id)) return null
  if (typeof name !== 'string' || !isDeviceKind(kind) || !isFingerprint(fp)) return null
  const clean = cleanName(name)
  if (!clean) return null
  const screen = parseScreen(raw.screen)
  if (screen === null) return null
  return { t: 'hello', v, id, name: clean, kind, fp, ...(screen ? { screen } : {}) }
}

function parseWant(raw: Record<string, unknown>): Want | null {
  const { width, height, fps, bitrate, codecs } = raw
  if (!isInt(width, 160, 8192) || !isInt(height, 120, 8192) || !isInt(fps, 1, 240)) return null
  if (!isNumber(bitrate, 0.5, 500)) return null
  if (!Array.isArray(codecs) || codecs.length > 16) return null
  if (!codecs.every((c) => typeof c === 'string' && MIME.test(c))) return null
  return { t: 'want', width, height, fps, bitrate, codecs: [...new Set(codecs as string[])] }
}

/** Lê uma linha recebida. Qualquer coisa fora do formato devolve null (quem chama encerra a conexão). */
export function parseMessage(line: string): Message | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (!isObject(raw)) return null
  switch (raw.t) {
    case 'hello':
      return parseHello(raw)
    case 'pending':
      return { t: 'pending' }
    case 'accepted':
      return typeof raw.trusted === 'boolean' ? { t: 'accepted', trusted: raw.trusted } : null
    case 'denied':
      return raw.reason === 'user' || raw.reason === 'busy' || raw.reason === 'version'
        ? { t: 'denied', reason: raw.reason }
        : null
    case 'cancel':
      return { t: 'cancel' }
    case 'want':
      return parseWant(raw)
    case 'offer':
    case 'answer':
      return isText(raw.sdp, MAX_SDP) ? { t: raw.t, sdp: raw.sdp } : null
    case 'ice': {
      const { candidate, sdpMid, sdpMLineIndex } = raw
      // Candidato vazio é o "fim dos candidatos" do WebRTC.
      if (typeof candidate !== 'string' || candidate.length > 2048) return null
      if (sdpMid !== null && !isText(sdpMid, 64)) return null
      if (sdpMLineIndex !== null && !isInt(sdpMLineIndex, 0, 64)) return null
      return { t: 'ice', candidate, sdpMid, sdpMLineIndex }
    }
    case 'bitrate':
      return isNumber(raw.mbps, 0.5, 500) ? { t: 'bitrate', mbps: raw.mbps } : null
    case 'bye':
      return raw.reason === 'user' || raw.reason === 'error' || raw.reason === 'quit'
        ? { t: 'bye', reason: raw.reason }
        : null
    case 'ping':
    case 'pong':
      return isNumber(raw.at, 0, Number.MAX_SAFE_INTEGER) ? { t: raw.t, at: raw.at } : null
    default:
      return null
  }
}

export function encodeMessage(message: Message): string {
  return JSON.stringify(message) + '\n'
}
