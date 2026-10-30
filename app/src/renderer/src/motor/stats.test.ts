import { describe, expect, it } from 'vitest'
import { summarize, type StatEntry } from './stats'

const inbound = (timestamp: number, extra: Record<string, unknown>): StatEntry => ({
  id: 'IT01V',
  type: 'inbound-rtp',
  kind: 'video',
  timestamp,
  codecId: 'CIT01_96',
  frameWidth: 1920,
  frameHeight: 1080,
  decoderImplementation: 'D3D11VideoDecoder',
  ...extra
})

const shared: StatEntry[] = [
  { id: 'CIT01_96', type: 'codec', timestamp: 0, mimeType: 'video/H264' },
  {
    id: 'CP1',
    type: 'candidate-pair',
    timestamp: 0,
    state: 'succeeded',
    nominated: true,
    currentRoundTripTime: 0.0042
  }
]

describe('summarize', () => {
  it('calcula bitrate, quadros e buffer entre duas leituras de quem mostra', () => {
    const before = [
      inbound(1000, {
        bytesReceived: 0,
        framesDecoded: 0,
        jitterBufferDelay: 0,
        jitterBufferEmittedCount: 0
      }),
      ...shared
    ]
    const now = [
      inbound(2000, {
        bytesReceived: 3_750_000,
        framesDecoded: 60,
        jitterBufferDelay: 0.9,
        jitterBufferEmittedCount: 60,
        packetsLost: 2,
        framesDropped: 1
      }),
      ...shared
    ]
    expect(summarize(before, now, { latencyMs: 31.6, displayMs: 6.4 })).toEqual({
      at: 2000,
      width: 1920,
      height: 1080,
      fps: 60,
      mbps: 30,
      codec: 'H264',
      implementation: 'D3D11VideoDecoder',
      rttMs: 4,
      packetsLost: 2,
      framesDropped: 1,
      jitterBufferMs: 15,
      latencyMs: 32,
      displayMs: 6,
      qualityLimitation: null
    })
  })

  it('lê o lado que envia', () => {
    const entry = (timestamp: number, bytesSent: number): StatEntry => ({
      id: 'OT01V',
      type: 'outbound-rtp',
      kind: 'video',
      timestamp,
      bytesSent,
      framesEncoded: 0,
      framesPerSecond: 59,
      encoderImplementation: 'MediaFoundationVideoEncodeAccelerator',
      qualityLimitationReason: 'bandwidth'
    })
    const result = summarize([entry(0, 0)], [entry(500, 1_250_000)])
    expect(result).toMatchObject({
      fps: 59,
      mbps: 20,
      implementation: 'MediaFoundationVideoEncodeAccelerator',
      qualityLimitation: 'bandwidth',
      rttMs: null
    })
  })

  it('na primeira leitura não inventa bitrate', () => {
    expect(summarize(null, [inbound(1000, { bytesReceived: 100 })])).toMatchObject({
      mbps: 0,
      jitterBufferMs: null
    })
  })

  it('sem vídeo ainda, não há resumo', () => {
    expect(summarize(null, shared)).toBeNull()
  })
})
