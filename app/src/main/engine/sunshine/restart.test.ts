import { describe, expect, it } from 'vitest'
import { createRestarter } from './restart'
import { FakeSunshineProcess } from './testing/fake-process'
import { STARTUP_SOFTWARE_LOG } from './testing/log-samples'

function setup(process = new FakeSunshineProcess()): {
  process: FakeSunshineProcess
  sleeps: number[]
  restart: ReturnType<typeof createRestarter>
} {
  const sleeps: number[] = []
  const sleep = async (ms: number): Promise<void> => {
    sleeps.push(ms)
    process.tick()
  }
  const restart = createRestarter({
    api: process,
    readLog: () => process.readLog(),
    sleep,
    timeoutMs: 10_000,
    pollMs: 500
  })
  return { process, sleeps, restart }
}

describe('createRestarter', () => {
  it('espera o Sunshine voltar e devolve o log novo, não o velho', async () => {
    const { process, restart } = setup()
    const before = process.log
    const log = await restart()
    expect(log).not.toBe(before)
    expect(log).toContain('Found H.264 encoder')
    expect(process.restarts).toBe(1)
    expect(process.reachable).toBe(true)
  })

  it('não confunde o log antigo com o novo enquanto o reinício não terminou', async () => {
    const process = new FakeSunshineProcess()
    process.restartTicks = 5
    const { restart, sleeps } = setup(process)
    await restart()
    expect(sleeps.length).toBeGreaterThanOrEqual(5)
  })

  it('desiste com uma mensagem clara se o Sunshine nunca volta', async () => {
    const process = new FakeSunshineProcess()
    process.restartTicks = 1_000_000
    const { restart } = setup(process)
    await expect(restart()).rejects.toThrow('O Sunshine não voltou depois de reiniciar.')
  })

  it('devolve texto vazio se a execução foi abandonada no meio', async () => {
    const { restart, process } = setup()
    let alive = true
    const result = restart(() => alive)
    alive = false
    expect(await result).toBe('')
    expect(process.restarts).toBe(1)
  })

  it('log que continua igual (sem nova partida) conta como reinício não concluído', async () => {
    const stuck = new FakeSunshineProcess()
    stuck.log = STARTUP_SOFTWARE_LOG
    stuck.restart = async () => undefined
    const restart = createRestarter({
      api: stuck,
      readLog: async () => STARTUP_SOFTWARE_LOG,
      sleep: async () => undefined,
      timeoutMs: 2000,
      pollMs: 500
    })
    await expect(restart()).rejects.toThrow('O Sunshine não voltou depois de reiniciar.')
  })
})
