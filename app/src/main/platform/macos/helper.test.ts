import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startDisplayHelper, type HelperProcess } from './helper'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function fakeHelper(): HelperProcess & {
  say(text: string): void
  complain(text: string): void
  die(code: number | null): void
  killed: () => boolean
  kills: () => number
} {
  let out: (text: string) => void = () => undefined
  let err: (text: string) => void = () => undefined
  let exit: (code: number | null) => void = () => undefined
  let killed = false
  let kills = 0
  return {
    onStdout: (cb) => void (out = cb),
    onStderr: (cb) => void (err = cb),
    onExit: (cb) => void (exit = cb),
    kill: () => {
      killed = true
      kills++
    },
    say: (text) => out(text),
    complain: (text) => err(text),
    die: (code) => exit(code),
    killed: () => killed,
    kills: () => kills
  }
}

describe('startDisplayHelper', () => {
  it('devolve o número da tela quando o auxiliar avisa que criou', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.say('DISPLAY_ID 7\n')
    expect((await started).displayId).toBe(7)
  })

  it('o aviso pode chegar em pedaços', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.say('DISPLAY_')
    helper.say('ID 1')
    helper.say('2\n')
    expect((await started).displayId).toBe(12)
  })

  it('o auxiliar encerra antes de criar a tela: o erro leva o que ele disse', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.complain('o macOS recusou criar o monitor virtual\n')
    helper.die(2)
    await expect(started).rejects.toThrow('o macOS recusou criar o monitor virtual')
  })

  it('encerra sem dizer nada: o erro cita o código de saída', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.die(64)
    await expect(started).rejects.toThrow('código 64')
  })

  it('não responde a tempo: desiste, encerra o auxiliar e diz o motivo', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper, 5_000)
    const assertion = expect(started).rejects.toThrow('não respondeu em 5 s')
    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
    expect(helper.killed()).toBe(true)
  })

  it('parar encerra o auxiliar, e parar duas vezes não faz mal', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.say('DISPLAY_ID 3\n')
    const running = await started
    running.stop()
    running.stop()
    expect(helper.kills()).toBe(1)
  })

  it('um aviso depois do primeiro não muda o resultado', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.say('DISPLAY_ID 4\nDISPLAY_ID 9\n')
    expect((await started).displayId).toBe(4)
  })

  it('a saída do auxiliar depois de pronto não gera erro solto', async () => {
    const helper = fakeHelper()
    const started = startDisplayHelper(() => helper)
    helper.say('DISPLAY_ID 4\n')
    await started
    expect(() => helper.die(0)).not.toThrow()
  })
})
