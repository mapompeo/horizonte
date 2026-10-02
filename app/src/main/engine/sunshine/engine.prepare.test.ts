import { describe, expect, it } from 'vitest'
import { GPU_ENCODERS } from '../../core/encoder'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { amdConfig } from './encoder-probe'
import type { EngineMemory, EngineMemoryValue } from './memory'
import type { PrepStep, Settings } from '../../../shared/types'
import { SunshineApiError } from './api'
import { SunshineEngine } from './engine'
import { FakeSunshineProcess } from './testing/fake-process'

const VIRTUAL = { deviceId: '{vdd}', friendlyName: 'VDD by MTT', originX: 1920 }
const PASSWORD = 'segredo-123'

function memory(initial: EngineMemoryValue | null = null): {
  api: EngineMemory
  box: { value: EngineMemoryValue | null }
} {
  const box: { value: EngineMemoryValue | null } = { value: initial }
  const api: EngineMemory = {
    load: async () => box.value,
    save: async (value) => {
      box.value = value
    }
  }
  return { api, box }
}

interface Harness {
  engine: SunshineEngine
  process: FakeSunshineProcess
  mem: { api: EngineMemory; box: { value: EngineMemoryValue | null } }
  calls: string[]
  steps: PrepStep[]
  prepare(settings?: Settings): Promise<void>
}

function setup(
  options: { withVirtual?: boolean; remembered?: EngineMemoryValue | null } = {}
): Harness {
  const process = new FakeSunshineProcess()
  if (options.withVirtual !== false) process.displays.push(VIRTUAL)
  process.rebuildLog()
  const mem = memory(options.remembered ?? null)
  const calls: string[] = []
  const engine = new SunshineEngine({
    installer: { ensureInstalled: async () => void calls.push('install') },
    display: {
      ensureVirtualDisplay: async () => void calls.push('display'),
      isVirtual: (display) => display.friendlyName === 'VDD by MTT'
    },
    memory: mem.api,
    credentials: async () => ({ username: 'horizonte', password: PASSWORD, port: 47989 }),
    createApi: () => process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    timing: { reachableTimeoutMs: 5000, restartTimeoutMs: 10_000, pollMs: 500 }
  })
  const steps: PrepStep[] = []
  const prepare = (settings: Settings = DEFAULT_SETTINGS): Promise<void> =>
    engine.prepare((step) => steps.push(step), settings)
  return { engine, process, mem, calls, steps, prepare }
}

describe('preparar: caminho feliz', () => {
  it('passa pelas três etapas na ordem e deixa tudo configurado', async () => {
    const t = setup()
    await t.prepare({ ...DEFAULT_SETTINGS, deviceName: 'Sala' })
    expect(t.steps).toEqual(['engine', 'display', 'encoder'])
    expect(t.calls).toEqual(['install', 'display'])
    expect(t.process.config.output_name).toBe('{vdd}')
    expect(t.process.config.sunshine_name).toBe('Sala')
    expect(t.process.config.amd_usage).toBe('lowlatency_high_quality')
    expect(t.process.config.encoder ?? '').toBe('')
    expect(t.mem.box.value).toEqual({ encoder: 'gpu-lowlatency_high_quality' })
  })

  it('o caso da RX 580: lowlatency falha, transcoding passa e fica gravado', async () => {
    const t = setup()
    t.process.hardwareWorksWith = new Set(['transcoding'])
    await t.prepare()
    expect(t.process.config.amd_usage).toBe('transcoding')
    expect(t.mem.box.value).toEqual({ encoder: 'gpu-transcoding' })
  })

  it('nenhum encoder de GPU confirmado: NÃO força o processador e lembra disso', async () => {
    const t = setup()
    t.process.hardwareWorksWith = new Set()
    await t.prepare()
    expect(t.process.config.encoder ?? '').toBe('')
    expect(t.process.config.amd_usage).toBe('lowlatency_high_quality')
    expect(t.mem.box.value).toEqual({ encoder: null })
  })

  it('o usuário escolheu o processador: força o software sem sondar', async () => {
    const t = setup()
    await t.prepare({ ...DEFAULT_SETTINGS, encoding: 'cpu' })
    expect(t.process.config.encoder).toBe('software')
    expect(t.process.calls.filter((call) => call.startsWith('saveConfig'))).toHaveLength(1)
  })
})

describe('preparar: de novo, sem reiniciar à toa', () => {
  it('na segunda vez, com tudo já configurado, não reinicia o Sunshine', async () => {
    const t = setup()
    await t.prepare()
    const restartsAfterFirst = t.process.restarts
    await t.prepare()
    expect(t.process.restarts).toBe(restartsAfterFirst)
  })

  it('com a GPU já funcionando no log e na configuração, lembra sem reiniciar o Sunshine', async () => {
    const t = setup()
    t.process.hardwareWorksWith = new Set(['transcoding'])
    t.process.config = {
      ...amdConfig(GPU_ENCODERS[1]!),
      output_name: '{vdd}',
      sunshine_name: DEFAULT_SETTINGS.deviceName
    }
    t.process.rebuildLog()
    await t.prepare()
    expect(t.process.restarts).toBe(0)
    expect(t.mem.box.value).toEqual({ encoder: 'gpu-transcoding' })
  })

  it('nome padrão que o Sunshine nem tem na configuração não força um reinício', async () => {
    const t = setup({ remembered: { encoder: 'gpu-transcoding' } })
    t.process.config = { ...amdConfig(GPU_ENCODERS[1]!), output_name: '{vdd}', encoder: '' }
    await t.prepare()
    expect(t.process.restarts).toBe(0)
    expect(t.process.config.sunshine_name).toBeUndefined()
  })

  it('log mostrando só o processador não vale como confirmação: sonda de verdade', async () => {
    const t = setup()
    t.process.hardwareWorksWith = new Set(['transcoding'])
    t.process.config = { ...amdConfig(GPU_ENCODERS[0]!) }
    t.process.rebuildLog()
    await t.prepare()
    expect(t.process.restarts).toBeGreaterThan(0)
    expect(t.process.config.amd_usage).toBe('transcoding')
  })

  it('com o resultado da sondagem lembrado, não sonda de novo', async () => {
    const t = setup({ remembered: { encoder: 'gpu-transcoding' } })
    await t.prepare()
    expect(t.process.config.amd_usage).toBe('transcoding')
    // Sem sondar e sem precisar procurar o monitor: só o reinício para aplicar a configuração.
    expect(t.process.restarts).toBe(1)
  })

  it('mudar o nome do computador regrava e reinicia uma vez', async () => {
    const t = setup()
    await t.prepare()
    const before = t.process.restarts
    await t.prepare({ ...DEFAULT_SETTINGS, deviceName: 'Outro nome' })
    expect(t.process.config.sunshine_name).toBe('Outro nome')
    expect(t.process.restarts).toBe(before + 1)
  })

  it('sair do modo processador limpa o encoder forçado', async () => {
    const t = setup()
    await t.prepare({ ...DEFAULT_SETTINGS, encoding: 'cpu' })
    expect(t.process.config.encoder).toBe('software')
    await t.prepare()
    expect(t.process.config.encoder).toBe('')
  })

  it('não apaga chaves que o usuário já tinha na configuração', async () => {
    const t = setup()
    t.process.config = { min_log_level: 'debug', global_prep_cmd: '[]' }
    await t.prepare()
    expect(t.process.config.min_log_level).toBe('debug')
    expect(t.process.config.global_prep_cmd).toBe('[]')
  })
})

describe('preparar: falhas', () => {
  it('sem o monitor virtual no Sunshine, diz isso em português', async () => {
    const t = setup({ withVirtual: false })
    await expect(t.prepare()).rejects.toThrow('Não achei o monitor virtual no Sunshine.')
  })

  it('senha recusada vira mensagem clara e não vaza a senha', async () => {
    const t = setup()
    t.process.unauthorized = true
    const failure = await t.prepare().then(
      () => null,
      (cause: unknown) => cause as Error
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure?.message).toContain('usuário ou a senha')
    expect(failure?.message).not.toContain(PASSWORD)
    expect(failure instanceof SunshineApiError || failure instanceof Error).toBe(true)
  })

  it('Sunshine que nunca responde vira mensagem clara', async () => {
    const t = setup()
    t.process.reachable = false
    await expect(t.prepare()).rejects.toThrow('O Sunshine não respondeu')
  })

  it('o instalador falhando para a preparação com a mensagem dele', async () => {
    const process = new FakeSunshineProcess()
    const engine = new SunshineEngine({
      installer: {
        ensureInstalled: async () => {
          throw new Error('Sem permissão para instalar.')
        }
      },
      display: { ensureVirtualDisplay: async () => undefined, isVirtual: () => true },
      memory: memory().api,
      credentials: async () => ({ username: 'u', password: 'p', port: 47989 }),
      createApi: () => process,
      readLog: () => process.readLog(),
      sleep: async () => process.tick()
    })
    await expect(engine.prepare(() => undefined, DEFAULT_SETTINGS)).rejects.toThrow(
      'Sem permissão para instalar.'
    )
  })
})

describe('preparar: abandonar no meio', () => {
  it('abort durante a preparação para as etapas seguintes', async () => {
    const t = setup()
    let count = 0
    const result = t.engine.prepare(() => {
      count++
      if (count === 2) void t.engine.abort()
    }, DEFAULT_SETTINGS)
    await result
    expect(t.process.config.amd_usage).toBeUndefined()
  })

  it('uma segunda preparação anula a primeira', async () => {
    const t = setup()
    const first = t.engine.prepare(() => undefined, DEFAULT_SETTINGS)
    const second = t.engine.prepare(() => undefined, { ...DEFAULT_SETTINGS, deviceName: 'Segunda' })
    await Promise.all([first, second])
    expect(t.process.config.sunshine_name).toBe('Segunda')
  })
})
