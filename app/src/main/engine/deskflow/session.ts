import { deskflowSettings, linksConfig, computerName, type MouseSide } from './config'

/** O pedaço do processo filho que importa; `child_process.spawn` de verdade entra no wire. */
export interface DeskflowProcess {
  kill(): void
  onExit(listener: (code: number | null) => void): void
}

/** Como chamar o `deskflow-core`: o executável e os argumentos que vêm antes do modo (o Flatpak precisa deles). */
export interface DeskflowCommand {
  command: string
  prefix: string[]
}

export interface MouseShareDeps {
  /** Garante o Deskflow instalado e diz como chamá-lo. */
  command(): Promise<DeskflowCommand>
  /** Pasta própria do Horizonte para os arquivos de ajustes do Deskflow. */
  dir: string
  writeFile(path: string, text: string): Promise<void>
  join(...parts: string[]): string
  spawn(command: string, args: string[]): Promise<DeskflowProcess>
}

export interface MouseShare {
  /** Este computador empresta o mouse e o teclado; o outro fica do lado `side`. */
  share(options: { name: string; peerName: string; side: MouseSide }): Promise<void>
  /** Este computador passa a ser controlado pelo mouse do outro. */
  follow(options: { name: string; serverAddress: string }): Promise<void>
  stop(): void
  /** O Deskflow terminou sozinho (erro, ou o outro lado fechou). */
  onEnded(listener: () => void): () => void
}

export function createMouseShare(deps: MouseShareDeps): MouseShare {
  let current: DeskflowProcess | null = null
  const ended = new Set<() => void>()

  async function run(mode: 'server' | 'client', settings: string): Promise<void> {
    stopCurrent()
    const file = deps.join(deps.dir, `${mode}.conf`)
    await deps.writeFile(file, settings)
    const { command, prefix } = await deps.command()
    const child = await deps.spawn(command, [...prefix, mode, '--new-instance', '-s', file])
    current = child
    child.onExit(() => {
      if (current !== child) return // foi o próprio stop
      current = null
      for (const listener of [...ended]) listener()
    })
  }

  function stopCurrent(): void {
    const child = current
    current = null
    child?.kill()
  }

  return {
    async share({ name, peerName, side }) {
      const linksFile = deps.join(deps.dir, 'links.conf')
      await deps.writeFile(linksFile, linksConfig(computerName(name), computerName(peerName), side))
      await run('server', deskflowSettings({ role: 'server', name, peerName, linksFile }))
    },
    async follow({ name, serverAddress }) {
      await run('client', deskflowSettings({ role: 'client', name, serverAddress }))
    },
    stop: stopCurrent,
    onEnded(listener) {
      ended.add(listener)
      return () => ended.delete(listener)
    }
  }
}
