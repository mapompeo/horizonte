import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionWatcher } from './session-watcher'

const run = (n: number, ...lines: string[]): string =>
  `[2026-10-02 18:00:0${n}.000]: Info: Sunshine version: x\n` +
  lines.map((line) => `[2026-10-02 18:00:0${n}.500]: Info: ${line}\n`).join('')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

interface Harness {
  watcher: ReturnType<typeof createSessionWatcher>
  events: string[]
  errors: unknown[]
  setLog(next: string): void
}

function setup(initial: string): Harness {
  let log = initial
  const events: string[] = []
  const errors: unknown[] = []
  const watcher = createSessionWatcher({
    readLog: async () => log,
    intervalMs: 100,
    deviceName: () => 'Notebook',
    onConnected: (device) => events.push(`connected:${device}`),
    onDisconnected: () => events.push('disconnected'),
    onError: (cause) => errors.push(cause)
  })
  return {
    watcher,
    events,
    errors,
    setLog: (next) => {
      log = next
    }
  }
}

describe('createSessionWatcher', () => {
  it('ignora o que já estava no log quando começou a vigiar', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED', 'CLIENT DISCONNECTED', 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(t.events).toEqual([])
    t.watcher.stop()
  })

  it('avisa quando um cliente conecta e desconecta', async () => {
    const t = setup(run(1))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(1, 'CLIENT CONNECTED', 'CLIENT DISCONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual(['connected:Notebook', 'disconnected'])
    t.watcher.stop()
  })

  it('não repete o aviso nas consultas seguintes', async () => {
    const t = setup(run(1))
    t.watcher.start()
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.events).toEqual(['connected:Notebook'])
    t.watcher.stop()
  })

  it('um log novo (Sunshine reiniciou) recomeça a contagem do zero', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(2, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual(['connected:Notebook'])
    t.watcher.stop()
  })

  it('um log novo sem eventos não gera aviso nenhum', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(2))
    await vi.advanceTimersByTimeAsync(350)
    expect(t.events).toEqual([])
    t.watcher.stop()
  })

  it('um trecho do log que desliza (log grande cortado) não reemite eventos antigos', async () => {
    const head = run(1, 'CLIENT CONNECTED')
    const t = setup(head + 'ruído antigo\nmais ruído\n')
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    // O arquivo passou do limite lido: o começo do trecho muda a cada consulta, a abertura da execução some.
    t.setLog('mais ruído\n[2026-10-02 18:00:01.600]: Info: CLIENT CONNECTED\n')
    await vi.advanceTimersByTimeAsync(150)
    t.setLog('[2026-10-02 18:00:01.600]: Info: CLIENT CONNECTED\nnovo ruído\n')
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual([])
    t.watcher.stop()
  })

  it('leitura que volta vazia (arquivo travado) não vira log novo', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog('')
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual([])
    t.watcher.stop()
  })

  it('desconexão seguida de reconexão na mesma consulta chega nessa ordem', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(1, 'CLIENT CONNECTED', 'CLIENT DISCONNECTED', 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual(['disconnected', 'connected:Notebook'])
    t.watcher.stop()
  })

  it('erro ao ler o log não para a vigilância', async () => {
    let fail = true
    const errors: unknown[] = []
    const events: string[] = []
    const watcher = createSessionWatcher({
      readLog: async () => {
        if (fail) throw new Error('arquivo travado')
        return run(1, 'CLIENT CONNECTED')
      },
      intervalMs: 100,
      deviceName: () => 'Notebook',
      onConnected: (device) => events.push(device),
      onDisconnected: () => undefined,
      onError: (cause) => errors.push(cause)
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(250)
    expect(errors.length).toBeGreaterThan(0)
    fail = false
    await vi.advanceTimersByTimeAsync(250)
    expect(events.length + errors.length).toBeGreaterThan(0)
    watcher.stop()
  })

  it('depois de parar, nada mais é avisado', async () => {
    const t = setup(run(1))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.watcher.stop()
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.events).toEqual([])
  })

  it('começar duas vezes não duplica os avisos', async () => {
    const t = setup(run(1))
    t.watcher.start()
    t.watcher.start()
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(300)
    expect(t.events).toEqual(['connected:Notebook'])
    t.watcher.stop()
  })

  it('o nome pode vir de uma consulta assíncrona, e a ordem dos avisos se mantém', async () => {
    let log = run(1)
    const events: string[] = []
    const watcher = createSessionWatcher({
      readLog: async () => log,
      intervalMs: 100,
      deviceName: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return 'Notebook'
      },
      onConnected: (device) => events.push(`connected:${device}`),
      onDisconnected: () => events.push('disconnected')
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    log = run(1, 'CLIENT CONNECTED', 'CLIENT DISCONNECTED')
    await vi.advanceTimersByTimeAsync(300)
    expect(events).toEqual(['connected:Notebook', 'disconnected'])
    watcher.stop()
  })

  it('parar com a consulta do nome em andamento descarta o aviso', async () => {
    let log = run(1)
    const events: string[] = []
    const watcher = createSessionWatcher({
      readLog: async () => log,
      intervalMs: 100,
      deviceName: () => new Promise((resolve) => setTimeout(() => resolve('Notebook'), 500)),
      onConnected: (device) => events.push(device),
      onDisconnected: () => undefined
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    log = run(1, 'CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(200)
    watcher.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toEqual([])
  })
})
