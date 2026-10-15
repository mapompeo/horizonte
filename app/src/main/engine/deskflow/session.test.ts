import { describe, expect, it, vi } from 'vitest'
import { createMouseShare, type DeskflowProcess, type MouseShareDeps } from './session'

function fakeProcess(): DeskflowProcess & { exit(code: number | null): void; killed: boolean } {
  let listener: ((code: number | null) => void) | null = null
  const proc = {
    killed: false,
    kill: () => {
      proc.killed = true
      listener?.(null)
    },
    onExit: (l: (code: number | null) => void) => {
      listener = l
    },
    exit: (code: number | null) => listener?.(code)
  }
  return proc
}

function harness(command = { command: 'deskflow-core.exe', prefix: [] as string[] }): {
  deps: MouseShareDeps
  files: Map<string, string>
  spawned: { command: string; args: string[]; proc: ReturnType<typeof fakeProcess> }[]
} {
  const files = new Map<string, string>()
  const spawned: { command: string; args: string[]; proc: ReturnType<typeof fakeProcess> }[] = []
  return {
    files,
    spawned,
    deps: {
      command: async () => command,
      dir: '/dados/deskflow',
      writeFile: async (path, text) => void files.set(path, text),
      join: (...parts) => parts.join('/'),
      spawn: vi.fn(async (cmd: string, args: string[]) => {
        const proc = fakeProcess()
        spawned.push({ command: cmd, args, proc })
        return proc
      })
    }
  }
}

describe('createMouseShare', () => {
  it('emprestar o mouse grava as ligações e os ajustes e sobe o servidor', async () => {
    const h = harness()
    await createMouseShare(h.deps).share({
      name: 'Desktop',
      links: [{ name: 'Notebook', side: 'right' }]
    })
    expect(h.files.get('/dados/deskflow/links.conf')).toContain('right = Notebook')
    expect(h.files.get('/dados/deskflow/server.conf')).toContain('coreMode=2')
    expect(h.spawned[0]?.args).toEqual([
      'server',
      '--new-instance',
      '-s',
      '/dados/deskflow/server.conf'
    ])
  })

  it('no Flatpak o comando leva o prefixo antes do modo', async () => {
    const h = harness({
      command: 'flatpak',
      prefix: ['run', '--command=deskflow-core', 'org.deskflow.deskflow']
    })
    await createMouseShare(h.deps).follow({ name: 'Notebook', serverAddress: '192.168.1.4' })
    expect(h.spawned[0]?.command).toBe('flatpak')
    expect(h.spawned[0]?.args.slice(0, 4)).toEqual([
      'run',
      '--command=deskflow-core',
      'org.deskflow.deskflow',
      'client'
    ])
    expect(h.files.get('/dados/deskflow/client.conf')).toContain('remoteHost=192.168.1.4')
  })

  it('trocar de papel encerra o processo anterior, e parar não conta como fim inesperado', async () => {
    const h = harness()
    const share = createMouseShare(h.deps)
    const ended = vi.fn()
    share.onEnded(ended)
    await share.share({ name: 'Desktop', links: [{ name: 'Notebook', side: 'left' }] })
    await share.follow({ name: 'Desktop', serverAddress: '10.0.0.2' })
    expect(h.spawned[0]?.proc.killed).toBe(true)
    share.stop()
    expect(h.spawned[1]?.proc.killed).toBe(true)
    expect(ended).not.toHaveBeenCalled()
  })

  it('o Deskflow terminando sozinho avisa quem escuta', async () => {
    const h = harness()
    const share = createMouseShare(h.deps)
    const ended = vi.fn()
    share.onEnded(ended)
    await share.follow({ name: 'Notebook', serverAddress: '192.168.1.4' })
    h.spawned[0]?.proc.exit(1)
    expect(ended).toHaveBeenCalledOnce()
  })
})
