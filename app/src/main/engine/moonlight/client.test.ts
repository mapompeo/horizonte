import { describe, expect, it, vi } from 'vitest'
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
    pairing.run.mockResolvedValueOnce(1)
    const { spawn, client } = make()
    await expect(client.connect('192.168.1.9', DEFAULT_SETTINGS)).rejects.toThrow(/pareamento/i)
    expect(spawn).not.toHaveBeenCalled()
  })
})
