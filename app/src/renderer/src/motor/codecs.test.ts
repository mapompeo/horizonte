import { describe, expect, it } from 'vitest'
import { orderCodecList, rankCodecs, videoMimes, type CodecProbe } from './codecs'

const probe = (mime: string, powerEfficient = false, supported = true): CodecProbe => ({
  mime,
  supported,
  powerEfficient
})
const ALL = ['video/H264', 'video/AV1', 'video/VP9', 'video/VP8']

describe('rankCodecs', () => {
  it('põe primeiro o que usa a placa de vídeo', () => {
    const probes = [
      probe('video/H264'),
      probe('video/AV1'),
      probe('video/VP9', true),
      probe('video/VP8')
    ]
    expect(rankCodecs(probes, ALL)).toEqual(['video/VP9', 'video/H264', 'video/AV1', 'video/VP8'])
  })

  it('sem placa de vídeo, segue a ordem base', () => {
    expect(
      rankCodecs(
        ALL.map((m) => probe(m)),
        ALL
      )
    ).toEqual(ALL)
  })

  it('tira o que o outro lado não decodifica', () => {
    const probes = ALL.map((m) => probe(m, m === 'video/AV1'))
    expect(rankCodecs(probes, ['video/vp8', 'video/H264'])).toEqual(['video/H264', 'video/VP8'])
  })

  it('tira o que este lado não codifica', () => {
    const probes = [probe('video/H264', false, false), probe('video/VP8')]
    expect(rankCodecs(probes, ALL)).toEqual(['video/VP8'])
  })
})

describe('orderCodecList', () => {
  const caps = [
    { mimeType: 'video/VP8' },
    { mimeType: 'video/rtx', sdpFmtpLine: 'apt=96' },
    { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42e01f' },
    { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=640c1f' },
    { mimeType: 'video/AV1' },
    { mimeType: 'video/red' },
    { mimeType: 'video/ulpfec' }
  ]

  it('mantém as variantes, a retransmissão e a correção de erro', () => {
    expect(orderCodecList(caps, ['video/H264', 'video/VP8']).map((c) => c.mimeType)).toEqual([
      'video/H264',
      'video/H264',
      'video/VP8',
      'video/rtx',
      'video/red',
      'video/ulpfec'
    ])
  })
})

describe('videoMimes', () => {
  it('lista cada codec uma vez, sem os auxiliares', () => {
    expect(
      videoMimes([
        { mimeType: 'video/H264' },
        { mimeType: 'video/h264' },
        { mimeType: 'video/rtx' },
        { mimeType: 'video/AV1' }
      ])
    ).toEqual(['video/H264', 'video/AV1'])
  })
})
