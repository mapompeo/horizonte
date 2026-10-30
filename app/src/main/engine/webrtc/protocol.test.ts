import { describe, expect, it } from 'vitest'
import { encodeMessage, parseMessage, type Message } from './protocol'

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(
  ':'
)
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

const hello = {
  t: 'hello',
  v: 1,
  id: ID,
  name: 'Notebook',
  kind: 'laptop',
  fp: FP
}

describe('parseMessage', () => {
  it.each<Message>([
    { t: 'hello', v: 1, id: ID, name: 'Notebook', kind: 'laptop', fp: FP },
    {
      t: 'hello',
      v: 1,
      id: ID,
      name: 'Desktop',
      kind: 'desktop',
      fp: FP,
      screen: { width: 1920, height: 1080 }
    },
    { t: 'pending' },
    { t: 'accepted', trusted: true },
    { t: 'denied', reason: 'busy' },
    { t: 'cancel' },
    {
      t: 'want',
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 30,
      codecs: ['video/H264', 'video/AV1']
    },
    { t: 'offer', sdp: 'v=0\r\n' },
    { t: 'answer', sdp: 'v=0\r\n' },
    {
      t: 'ice',
      candidate: 'candidate:1 1 udp 1 192.168.1.3 47920 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0
    },
    { t: 'ice', candidate: '', sdpMid: null, sdpMLineIndex: null },
    { t: 'bitrate', mbps: 20 },
    { t: 'bye', reason: 'user' },
    { t: 'ping', at: 1730000000000 },
    { t: 'pong', at: 1730000000000 }
  ])('aceita e devolve igual: $t', (message) => {
    expect(parseMessage(encodeMessage(message).trim())).toEqual(message)
  })

  it.each([
    ['JSON inválido', '{'],
    ['lista', '[]'],
    ['tipo desconhecido', '{"t":"oi"}'],
    ['hello sem impressão digital', JSON.stringify({ ...hello, fp: undefined })],
    ['impressão digital em minúsculas', JSON.stringify({ ...hello, fp: FP.toLowerCase() })],
    ['impressão digital curta', JSON.stringify({ ...hello, fp: 'AB:CD' })],
    ['id com letras estranhas', JSON.stringify({ ...hello, id: 'ZZZ; rm -rf' })],
    ['tipo de aparelho desconhecido', JSON.stringify({ ...hello, kind: 'geladeira' })],
    ['nome só com controles', JSON.stringify({ ...hello, name: '\u0000​' })],
    ['tela negativa', JSON.stringify({ ...hello, screen: { width: -1, height: 10 } })],
    ['versão fracionária', JSON.stringify({ ...hello, v: 1.5 })],
    ['want sem codecs', '{"t":"want","width":1920,"height":1080,"fps":60,"bitrate":30}'],
    [
      'want com codec que não é vídeo',
      '{"t":"want","width":1920,"height":1080,"fps":60,"bitrate":30,"codecs":["audio/opus"]}'
    ],
    [
      'want com fps absurdo',
      '{"t":"want","width":1920,"height":1080,"fps":1000,"bitrate":30,"codecs":[]}'
    ],
    ['oferta vazia', '{"t":"offer","sdp":""}'],
    ['oferta gigante', JSON.stringify({ t: 'offer', sdp: 'a'.repeat(40_000) })],
    ['bitrate zero', '{"t":"bitrate","mbps":0}'],
    ['bye com motivo inventado', '{"t":"bye","reason":"porque sim"}'],
    ['ice sem candidato', '{"t":"ice","sdpMid":"0","sdpMLineIndex":0}'],
    ['ping sem hora', '{"t":"ping"}']
  ])('recusa %s', (_name, line) => {
    expect(parseMessage(line)).toBeNull()
  })

  it('limpa o nome que veio da rede', () => {
    const parsed = parseMessage(JSON.stringify({ ...hello, name: '  Note‮book\n ' }))
    expect(parsed).toMatchObject({ t: 'hello', name: 'Notebook' })
  })

  it('tira codecs repetidos', () => {
    const parsed = parseMessage(
      '{"t":"want","width":1920,"height":1080,"fps":60,"bitrate":30,"codecs":["video/VP9","video/VP9"]}'
    )
    expect(parsed).toMatchObject({ codecs: ['video/VP9'] })
  })

  it('cada mensagem vira uma linha só', () => {
    const line = encodeMessage({ t: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' })
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
  })
})
