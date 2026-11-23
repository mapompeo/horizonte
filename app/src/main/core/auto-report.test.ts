import { describe, expect, it } from 'vitest'
import { createAutoReporter, MAX_PER_DAY } from './auto-report'

function setup(enabled = true, send = async (): Promise<boolean> => true) {
  let stored: Record<string, number> = {}
  let clock = 1_000_000
  const sent: string[] = []
  const reporter = createAutoReporter({
    enabled: () => enabled,
    send: async (code) => {
      sent.push(code)
      return send()
    },
    now: () => clock,
    load: () => stored,
    save: (value) => (stored = value)
  })
  return { reporter, sent, tick: (ms: number) => (clock += ms) }
}

describe('envio automático de erros', () => {
  it('desligado (o padrão): nunca manda', async () => {
    const t = setup(false)
    expect(await t.reporter.onError('201')).toBe('skipped')
    expect(t.sent).toEqual([])
  })

  it('manda uma vez por código por dia, e de novo no dia seguinte', async () => {
    const t = setup()
    expect(await t.reporter.onError('201')).toBe('sent')
    expect(await t.reporter.onError('201')).toBe('skipped')
    t.tick(24 * 60 * 60 * 1000 + 1)
    expect(await t.reporter.onError('201')).toBe('sent')
    expect(t.sent).toEqual(['201', '201'])
  })

  it(`no máximo ${MAX_PER_DAY} códigos diferentes por dia`, async () => {
    const t = setup()
    for (const code of ['201', '202', '203', '204', '205']) await t.reporter.onError(code)
    expect(t.sent).toEqual(['201', '202', '203'])
  })

  it('falha (sem internet) não conta: tenta de novo no próximo erro', async () => {
    let ok = false
    const t = setup(true, async () => ok)
    expect(await t.reporter.onError('301')).toBe('failed')
    ok = true
    expect(await t.reporter.onError('301')).toBe('sent')
    expect(t.sent).toEqual(['301', '301'])
  })

  it('um de cada vez: dois erros juntos não mandam duas vezes', async () => {
    let release: (v: boolean) => void = () => undefined
    const t = setup(true, () => new Promise<boolean>((r) => (release = r)))
    const first = t.reporter.onError('401')
    expect(await t.reporter.onError('402')).toBe('skipped')
    release(true)
    expect(await first).toBe('sent')
  })
})
