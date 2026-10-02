import { describe, expect, it } from 'vitest'
import {
  countSessionEvents,
  countStartups,
  isStartupComplete,
  logSignature,
  parseDisplays,
  parseFoundEncoder
} from './log'
import { DISPLAYS_BLOCK, STARTUP_AMF_LOG, STARTUP_SOFTWARE_LOG } from './testing/log-samples'

describe('parseFoundEncoder', () => {
  it('reconhece o encoder de GPU', () => {
    expect(parseFoundEncoder(STARTUP_AMF_LOG)).toEqual({
      name: 'h264_amf',
      backend: 'amdvce',
      hardware: true
    })
  })

  it('reconhece o encoder por software como não sendo de hardware', () => {
    expect(parseFoundEncoder(STARTUP_SOFTWARE_LOG)).toEqual({
      name: 'libx264',
      backend: 'software',
      hardware: false
    })
  })

  it('usa só a última execução quando o log tem várias', () => {
    expect(parseFoundEncoder(STARTUP_AMF_LOG + STARTUP_SOFTWARE_LOG)?.hardware).toBe(false)
    expect(parseFoundEncoder(STARTUP_SOFTWARE_LOG + STARTUP_AMF_LOG)?.hardware).toBe(true)
  })

  it('um teste de encoder ainda em andamento ainda não tem resultado', () => {
    const emAndamento = `[x]: Info: // Testing for available encoders, this may generate errors. //
[x]: Info: Trying encoder [amdvce]
`
    expect(parseFoundEncoder(STARTUP_AMF_LOG + emAndamento)).toBeNull()
  })

  it('log vazio, sem a seção ou com lixo vira nulo, nunca exceção', () => {
    expect(parseFoundEncoder('')).toBeNull()
    expect(parseFoundEncoder('nada a ver')).toBeNull()
    expect(parseFoundEncoder('Testing for available encoders\nFound H.264 encoder: [')).toBeNull()
  })
})

describe('parseDisplays', () => {
  it('lê os monitores da última listagem', () => {
    const displays = parseDisplays(STARTUP_SOFTWARE_LOG)
    expect(displays).toHaveLength(2)
    expect(displays[0]).toEqual({
      deviceId: '{5eb52002-659f-5729-bdd8-9cdc4efd1bf5}',
      displayName: '\\\\.\\DISPLAY40',
      friendlyName: 'VDD by MTT',
      width: 1920,
      height: 1080,
      primary: false,
      originX: 1920
    })
    expect(displays[1]?.primary).toBe(true)
    expect(displays[1]?.friendlyName).toBe('24G2W1G4')
  })

  it('funciona com quebras de linha do Windows', () => {
    expect(parseDisplays(STARTUP_SOFTWARE_LOG.replace(/\n/g, '\r\n'))).toHaveLength(2)
  })

  it('usa a última listagem quando há várias', () => {
    const umSo = `[x]: Info: Currently available display devices:
[
  {
    "device_id": "{unico}",
    "display_name": "d",
    "friendly_name": "Unico",
    "info": { "primary": true, "origin_point": { "x": 0, "y": 0 }, "resolution": { "width": 800, "height": 600 } }
  }
]
`
    expect(parseDisplays(DISPLAYS_BLOCK + umSo).map((display) => display.deviceId)).toEqual([
      '{unico}'
    ])
    expect(parseDisplays(umSo + DISPLAYS_BLOCK)).toHaveLength(2)
  })

  it('JSON quebrado, sem listagem ou vazio vira lista vazia', () => {
    expect(parseDisplays('')).toEqual([])
    expect(parseDisplays('Currently available display devices:\n[\n  {oops\n]')).toEqual([])
    expect(parseDisplays('Currently available display devices:\n[]')).toEqual([])
    expect(parseDisplays('Currently available display devices:\n{"a":1}')).toEqual([])
  })

  it('ignora itens sem identificador', () => {
    const log =
      'Currently available display devices:\n[\n  {"friendly_name": "x"},\n  {"device_id": "{a}", "display_name": "d", "friendly_name": "f", "info": {}}\n]\n'
    expect(parseDisplays(log).map((display) => display.deviceId)).toEqual(['{a}'])
  })
})

describe('reinício', () => {
  it('detecta o fim da partida', () => {
    expect(isStartupComplete(STARTUP_SOFTWARE_LOG)).toBe(true)
    expect(isStartupComplete('só o começo')).toBe(false)
  })

  it('conta as partidas', () => {
    expect(countStartups(STARTUP_SOFTWARE_LOG)).toBe(1)
    expect(countStartups(STARTUP_SOFTWARE_LOG + STARTUP_AMF_LOG)).toBe(2)
    expect(countStartups('')).toBe(0)
  })

  it('a assinatura é a primeira linha e muda de uma execução para outra', () => {
    expect(logSignature(STARTUP_SOFTWARE_LOG)).toContain('Sunshine version')
    expect(logSignature(STARTUP_SOFTWARE_LOG)).not.toBe(logSignature(STARTUP_AMF_LOG))
    expect(logSignature('')).toBe('')
    expect(logSignature('a'.repeat(1000)).length).toBeLessThanOrEqual(160)
  })
})

describe('countSessionEvents', () => {
  it('conta conexões e desconexões', () => {
    const log = `${STARTUP_AMF_LOG}[2026-10-02 17:30:00.000]: Info: CLIENT DISCONNECTED
[2026-10-02 17:31:00.000]: Info: CLIENT CONNECTED
`
    expect(countSessionEvents(log)).toEqual({ connected: 2, disconnected: 1 })
  })

  it('texto parecido no meio de outra linha não conta', () => {
    expect(countSessionEvents('Info: o CLIENT CONNECTED falso aqui no meio\n')).toEqual({
      connected: 0,
      disconnected: 0
    })
  })

  it('funciona com quebras de linha do Windows', () => {
    expect(countSessionEvents(STARTUP_AMF_LOG.replace(/\n/g, '\r\n')).connected).toBe(1)
  })
})
