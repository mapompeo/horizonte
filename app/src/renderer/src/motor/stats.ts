import type { MotorStats } from '../../../shared/motor'

/** Uma entrada do `getStats()`, só com o que lemos. */
export type StatEntry = Record<string, unknown> & { id: string; type: string; timestamp: number }

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

function find(entries: StatEntry[], type: string): StatEntry | undefined {
  return entries.find((e) => e.type === type && (e.kind ?? e.mediaType) === 'video')
}

/**
 * Resume um segundo de sessão a partir de duas leituras do `getStats()` (a anterior e a atual), do lado que envia
 * (`outbound-rtp`) ou do que mostra (`inbound-rtp`).
 */
export function summarize(
  previous: StatEntry[] | null,
  current: StatEntry[],
  timing: { latencyMs: number | null; displayMs: number | null } = {
    latencyMs: null,
    displayMs: null
  }
): MotorStats | null {
  const rtp = find(current, 'outbound-rtp') ?? find(current, 'inbound-rtp')
  if (!rtp) return null
  const sending = rtp.type === 'outbound-rtp'
  const before = previous?.find((e) => e.id === rtp.id)
  const seconds = before ? (rtp.timestamp - before.timestamp) / 1000 : 0

  const bytesKey = sending ? 'bytesSent' : 'bytesReceived'
  const framesKey = sending ? 'framesEncoded' : 'framesDecoded'
  const delta = (key: string): number | null => {
    const now = num(rtp[key])
    const then = before ? num(before[key]) : null
    return now !== null && then !== null ? now - then : null
  }

  const bytes = delta(bytesKey)
  const frames = delta(framesKey)
  const mbps = bytes !== null && seconds > 0 ? (bytes * 8) / seconds / 1e6 : 0
  const fps = num(rtp.framesPerSecond) ?? (frames !== null && seconds > 0 ? frames / seconds : 0)

  const codecEntry = current.find((e) => e.id === rtp.codecId)
  const pair =
    current.find(
      (e) => e.type === 'candidate-pair' && e.nominated === true && e.state === 'succeeded'
    ) ?? current.find((e) => e.type === 'candidate-pair' && e.state === 'succeeded')
  const rtt = num(pair?.currentRoundTripTime)

  const delay = delta('jitterBufferDelay')
  const emitted = delta('jitterBufferEmittedCount')

  return {
    at: rtp.timestamp,
    width: num(rtp.frameWidth) ?? 0,
    height: num(rtp.frameHeight) ?? 0,
    fps: Math.round(fps * 10) / 10,
    mbps: Math.round(mbps * 100) / 100,
    codec: (str(codecEntry?.mimeType) ?? '').replace(/^video\//, ''),
    implementation:
      str(sending ? rtp.encoderImplementation : rtp.decoderImplementation) ?? 'desconhecido',
    rttMs: rtt !== null ? Math.round(rtt * 1000) : null,
    packetsLost: num(rtp.packetsLost) ?? 0,
    framesDropped: num(rtp.framesDropped) ?? 0,
    jitterBufferMs:
      delay !== null && emitted !== null && emitted > 0
        ? Math.round((delay / emitted) * 1000)
        : null,
    latencyMs: timing.latencyMs !== null ? Math.round(timing.latencyMs) : null,
    displayMs: timing.displayMs !== null ? Math.round(timing.displayMs) : null,
    qualityLimitation: sending ? str(rtp.qualityLimitationReason) : null,
    hardware: bool(sending ? rtp.powerEfficientEncoder : rtp.powerEfficientDecoder)
  }
}
