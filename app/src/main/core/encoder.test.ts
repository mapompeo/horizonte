import { afterEach, describe, expect, it, vi } from 'vitest'
import { CPU_ENCODER, chooseEncoder, type Probe } from './encoder'

afterEach(() => {
  vi.useRealTimers()
})

describe('chooseEncoder', () => {
  it('usa a primeira opção de GPU que abre', async () => {
    const tried: string[] = []
    const result = await chooseEncoder(async (candidate) => {
      tried.push(candidate.id)
      return true
    })
    expect(result.candidate.id).toBe('gpu-lowlatency_high_quality')
    expect(result.fellBack).toBe(false)
    expect(tried).toEqual(['gpu-lowlatency_high_quality'])
  })

  it('cai para transcoding quando lowlatency é recusado', async () => {
    const result = await chooseEncoder(async (candidate) => candidate.amdUsage === 'transcoding')
    expect(result.candidate.id).toBe('gpu-transcoding')
    expect(result.fellBack).toBe(false)
  })

  it('cai para o processador quando nenhuma GPU abre', async () => {
    const result = await chooseEncoder(async () => false)
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })

  it('erro lançado pela sondagem conta como falha', async () => {
    const probe: Probe = async () => {
      throw new Error('driver')
    }
    const result = await chooseEncoder(probe)
    expect(result.candidate).toEqual(CPU_ENCODER)
  })

  it('erro síncrono na sondagem conta como falha', async () => {
    const probe = (() => {
      throw new Error('boom')
    }) as unknown as Probe
    const result = await chooseEncoder(probe)
    expect(result.candidate).toEqual(CPU_ENCODER)
  })

  it('o processador nunca é sondado', async () => {
    const tried: string[] = []
    await chooseEncoder(async (candidate) => {
      tried.push(candidate.id)
      return false
    })
    expect(tried).not.toContain('cpu')
  })

  it('sondagem que nunca responde vira falha depois do tempo limite', async () => {
    vi.useFakeTimers()
    const pending = chooseEncoder(() => new Promise<boolean>(() => {}), 'auto', 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    const result = await pending
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })

  it('preferência por processador não sonda nada', async () => {
    let calls = 0
    const result = await chooseEncoder(async () => {
      calls++
      return true
    }, 'cpu')
    expect(calls).toBe(0)
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(false)
  })

  it('preferência por GPU que falha tudo ainda termina no processador', async () => {
    const result = await chooseEncoder(async () => false, 'gpu')
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })
})
