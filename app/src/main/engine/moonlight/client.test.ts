import { describe, expect, it, vi, type Mock } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { buildStreamArgs, createMoonlightClient, type MoonlightProcess } from './client'

function fakeProcess(): MoonlightProcess & { exit(code: number): void; killed: boolean } {
  let listener: (code: number | null) => void = () => undefined
  const proc = {
    killed: false,
    kill() {
      proc.killed = true
    },
    onExit(l: (code: number | null) => void) {
      listener = l
    },
    exit(code: number) {
      listener(code)
    }
  }
  return proc
}

describe('buildStreamArgs', () => {
  it('traduz os ajustes para a linha de comando do Moonlight', () => {
    const args = buildStreamArgs('192.168.1.3', {
      ...DEFAULT_SETTINGS,
      resolution: '1440p',
      fps: 120,
      bitrate: 40,
      codec: 'hevc'
    })
    expect(args.slice(0, 3)).toEqual(['stream', '192.168.1.3', 'Desktop'])
    expect(args).toEqual(expect.arrayContaining(['--resolution', '2560x1440']))
    expect(args).toEqual(expect.arrayContaining(['--fps', '120']))
    expect(args).toEqual(expect.arrayContaining(['--bitrate', '40000']))
    expect(args).toEqual(expect.arrayContaining(['--video-codec', 'HEVC']))
  })
})

describe('createMoonlightClient', () => {
  const pairing = {
    run: vi.fn<(args: string[]) => Promise<number | null>>(async () => 0),
    sendPin: vi.fn(async () => undefined),
    deviceName: () => 'Notebook',
    randomPin: () => '4821'
  }
  const make = (
    proc = fakeProcess()
  ): {
    proc: ReturnType<typeof fakeProcess>
    spawn: ReturnType<typeof vi.fn>
    client: ReturnType<typeof createMoonlightClient>
  } => {
    const spawn = vi.fn(async () => proc)
    return {
      proc,
      spawn,
      client: createMoonlightClient({ spawn, listHosts: async () => [], ...pairing })
    }
  }

  it('conecta abrindo o Moonlight e avisa quando a transmissão acaba sozinha', async () => {
    const { proc, spawn, client } = make()
    const ended = vi.fn()
    client.onStreamEnded(ended)

    await client.connect('192.168.1.3', DEFAULT_SETTINGS)
    expect(spawn).toHaveBeenCalledOnce()
    proc.exit(0)

    expect(ended).toHaveBeenCalledOnce()
  })

  it('desconectar encerra o Moonlight sem avisar que "acabou"', async () => {
    const { proc, client } = make()
    const ended = vi.fn()
    client.onStreamEnded(ended)
    await client.connect('192.168.1.3', DEFAULT_SETTINGS)

    await client.disconnect()
    proc.exit(1)

    expect(proc.killed).toBe(true)
    expect(ended).not.toHaveBeenCalled()
  })

  it('não abre duas transmissões ao mesmo tempo', async () => {
    const { client } = make()
    await client.connect('192.168.1.3', DEFAULT_SETTINGS)
    await expect(client.connect('192.168.1.4', DEFAULT_SETTINGS)).rejects.toThrow(/já existe/i)
  })

  it('na primeira conexão manda o PIN pelo canal, pareia com ele e só então transmite', async () => {
    pairing.run.mockClear()
    pairing.sendPin.mockClear()
    const { spawn, client } = make()

    await client.connect('192.168.1.3', DEFAULT_SETTINGS)
    await client.disconnect()
    await client.connect('192.168.1.3', DEFAULT_SETTINGS)

    expect(pairing.sendPin).toHaveBeenCalledTimes(1)
    expect(pairing.sendPin).toHaveBeenCalledWith('192.168.1.3', 'Notebook', '4821')
    expect(pairing.run).toHaveBeenCalledWith(['pair', '192.168.1.3', '--pin', '4821'])
    expect(spawn).toHaveBeenCalledTimes(2) // pareou só uma vez
  })

  it('pareamento recusado explica e não abre a transmissão', async () => {
    pairing.run.mockResolvedValue(1) // o pair falha e o list também: não está pareado
    const { spawn, client } = make()
    await expect(client.connect('192.168.1.9', DEFAULT_SETTINGS)).rejects.toThrow(/pareamento/i)
    expect(spawn).not.toHaveBeenCalled()
    pairing.run.mockResolvedValue(0)
  })

  it('pair que não encerra (null) mas o list enxerga o aparelho: está pareado e transmite', async () => {
    pairing.run.mockImplementation(async (args) => (args[0] === 'pair' ? null : 0))
    const { spawn, client } = make()
    await client.connect('192.168.1.8', DEFAULT_SETTINGS)
    expect(pairing.run).toHaveBeenCalledWith(['list', '192.168.1.8'])
    expect(spawn).toHaveBeenCalledTimes(1)
    pairing.run.mockImplementation(async () => 0)
  })

  describe('aparelhos já pareados', () => {
    const store = (
      initial: string[] = []
    ): { load: () => Promise<string[]>; save: Mock<(hosts: string[]) => Promise<void>> } => ({
      load: async () => initial,
      save: vi.fn<(hosts: string[]) => Promise<void>>(async () => undefined)
    })
    const makeWith = (
      pairedHosts: ReturnType<typeof store>,
      now: () => number = () => 0
    ): {
      proc: ReturnType<typeof fakeProcess>
      client: ReturnType<typeof createMoonlightClient>
    } => {
      const proc = fakeProcess()
      return {
        proc,
        client: createMoonlightClient({
          spawn: async () => proc,
          listHosts: async () => [],
          ...pairing,
          pairedHosts,
          now
        })
      }
    }

    it('aparelho pareado em outra abertura do app não pareia de novo', async () => {
      pairing.run.mockClear()
      pairing.sendPin.mockClear()
      const { client } = makeWith(store(['192.168.1.3']))
      await client.connect('192.168.1.3', DEFAULT_SETTINGS)
      expect(pairing.run).not.toHaveBeenCalled()
      expect(pairing.sendPin).not.toHaveBeenCalled()
    })

    it('depois de parear, grava o aparelho para as próximas aberturas', async () => {
      const pairedHosts = store()
      const { client } = makeWith(pairedHosts)
      await client.connect('192.168.1.3', DEFAULT_SETTINGS)
      expect(pairedHosts.save).toHaveBeenCalledWith(['192.168.1.3'])
    })

    it('transmissão que cai logo com erro esquece o pareamento, para tentar parear de novo', async () => {
      pairing.run.mockClear()
      const pairedHosts = store(['192.168.1.3'])
      let clock = 0
      const { proc, client } = makeWith(pairedHosts, () => clock)
      await client.connect('192.168.1.3', DEFAULT_SETTINGS)
      clock = 2000
      proc.exit(1)
      expect(pairedHosts.save).toHaveBeenLastCalledWith([])
      await client.connect('192.168.1.3', DEFAULT_SETTINGS)
      expect(pairing.run).toHaveBeenCalledOnce()
    })

    it('transmissão encerrada normalmente (código 0), mesmo logo, mantém o pareamento', async () => {
      const pairedHosts = store(['192.168.1.3'])
      const { proc, client } = makeWith(pairedHosts, () => 0)
      await client.connect('192.168.1.3', DEFAULT_SETTINGS)
      proc.exit(0)
      expect(pairedHosts.save).not.toHaveBeenCalled()
    })

    it('transmissão que acaba depois de muito tempo, mesmo com erro, mantém o pareamento', async () => {
      const pairedHosts = store(['192.168.1.3'])
      let clock = 0
      const { proc, client } = makeWith(pairedHosts, () => clock)
      await client.connect('192.168.1.3', DEFAULT_SETTINGS)
      clock = 120_000
      proc.exit(1)
      expect(pairedHosts.save).not.toHaveBeenCalled()
    })
  })
})
