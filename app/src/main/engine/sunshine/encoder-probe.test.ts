import { describe, expect, it } from 'vitest'
import {
  chooseEncoder,
  CPU_ENCODER,
  GPU_ENCODERS,
  type EncoderCandidate,
  type Probe
} from '../../core/encoder'
import { amdConfig, createLogEncoderProbe } from './encoder-probe'
import { createRestarter } from './restart'
import { FakeSunshineProcess } from './testing/fake-process'

function setup(works: string[]): { process: FakeSunshineProcess; probe: Probe } {
  const process = new FakeSunshineProcess()
  process.hardwareWorksWith = new Set(works)
  const restartAndRead = createRestarter({
    api: process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    timeoutMs: 10_000,
    pollMs: 500
  })
  const probe = createLogEncoderProbe({ api: process, restartAndRead })
  return { process, probe }
}

const gpu = (index: number): EncoderCandidate => {
  const candidate = GPU_ENCODERS[index]
  if (candidate === undefined) throw new Error('candidato de GPU inexistente')
  return candidate
}

describe('amdConfig', () => {
  it('traz o uso do candidato e as opções que provamos na RX 580', () => {
    expect(amdConfig(gpu(1))).toEqual({
      amd_usage: 'transcoding',
      amd_rc: 'cbr',
      amd_quality: 'speed',
      amd_enforce_hrd: 'disabled',
      amd_preanalysis: 'disabled',
      amd_vbaq: 'disabled'
    })
  })

  it('o processador não leva opções da AMD', () => {
    expect(amdConfig(CPU_ENCODER)).toEqual({})
  })
})

describe('createLogEncoderProbe', () => {
  it('é verdadeiro quando o log mostra o encoder de GPU', async () => {
    const { probe, process } = setup(['lowlatency_high_quality'])
    expect(await probe(gpu(0))).toBe(true)
    expect(process.config.amd_usage).toBe('lowlatency_high_quality')
    expect(process.restarts).toBe(1)
  })

  it('é falso quando o log mostra o encoder por software', async () => {
    const { probe } = setup([])
    expect(await probe(gpu(0))).toBe(false)
  })

  it('o caso da RX 580: lowlatency falha e transcoding passa', async () => {
    const { probe } = setup(['transcoding'])
    const result = await chooseEncoder(probe)
    expect(result.candidate.id).toBe('gpu-transcoding')
    expect(result.fellBack).toBe(false)
  })

  it('nenhum candidato abre: termina no processador', async () => {
    const { probe } = setup([])
    const result = await chooseEncoder(probe)
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })

  it('um reinício que não termina vira falha do candidato, não exceção', async () => {
    const { probe, process } = setup(['lowlatency_high_quality'])
    process.restartTicks = 1_000_000
    const result = await chooseEncoder(probe, 'auto', 5000)
    expect(result.candidate).toEqual(CPU_ENCODER)
  })
})

it('n�o reinicia quando a sondagem � cancelada durante a grava��o despachada', async () => {
  const process = new FakeSunshineProcess()
  const controller = new AbortController()
  let release!: () => void
  const save = process.saveConfig.bind(process)
  process.saveConfig = async (patch) => {
    await save(patch)
    await new Promise<void>((resolve) => {
      release = resolve
    })
  }
  let restarts = 0
  const probe = createLogEncoderProbe({
    api: process,
    restartAndRead: async () => {
      restarts++
      return process.log
    }
  })
  const result = probe(gpu(0), controller.signal)
  await Promise.resolve()
  controller.abort()
  release()
  await expect(result).rejects.toThrow('cancelada')
  expect(process.config.amd_usage).toBe('lowlatency_high_quality')
  expect(restarts).toBe(0)
})

it('nao grava candidatos seguintes de uma geracao abandonada', async () => {
  const process = new FakeSunshineProcess()
  let alive = true
  let release!: () => void
  let entered!: () => void
  const restarting = new Promise<void>((resolve) => {
    entered = resolve
  })
  const probe = createLogEncoderProbe({
    api: process,
    alive: () => alive,
    restartAndRead: async () =>
      new Promise<string>((resolve) => {
        release = () => resolve(process.log)
        entered()
      })
  })
  const result = chooseEncoder(probe, 'auto', 5000)
  await restarting
  alive = false
  release()
  await result
  expect(process.calls.filter((call) => call.startsWith('saveConfig'))).toHaveLength(1)
})
