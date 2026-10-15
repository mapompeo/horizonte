import { execFile, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { Bonjour } from 'bonjour-service'
import type { Host } from '../../../shared/types'
import type { MouseEngine } from '../port'
import { createMouseEngine, MOUSE_CHANNEL_PORT, type MouseChannel } from './mouse-engine'
import { createMouseShare, type DeskflowCommand } from './session'
import { DESKFLOW_WINDOWS } from './versions'

const SERVICE_TYPE = 'horizonte-mouse'
const MAX_BODY = 2048

/** Canal HTTP do modo Mouse: só aceita POST com JSON pequeno; o resto é recusado. */
function createChannel(): MouseChannel {
  let server: Server | null = null
  return {
    async listen(onMessage) {
      if (server) return
      const created = createServer((request, response) => {
        if (request.method !== 'POST') return void response.writeHead(405).end()
        let raw = ''
        request.on('data', (chunk: Buffer) => {
          raw += chunk.toString('utf8')
          if (raw.length > MAX_BODY) request.destroy()
        })
        request.on('end', () => {
          let body: unknown = null
          try {
            body = raw ? JSON.parse(raw) : {}
          } catch {
            return void response.writeHead(400).end()
          }
          const ok = onMessage(request.url ?? '', body, request.socket.remoteAddress ?? '')
          response.writeHead(ok ? 204 : 400).end()
        })
      })
      await new Promise<void>((resolve, reject) => {
        created.once('error', reject)
        created.listen(MOUSE_CHANNEL_PORT, () => resolve())
      })
      server = created
    },
    async close() {
      const current = server
      server = null
      if (current) await new Promise<void>((resolve) => current.close(() => resolve()))
    },
    async send(address, path, body) {
      const host = address.includes(':') ? `[${address}]` : address
      const response = await fetch(`http://${host}:${MOUSE_CHANNEL_PORT}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error(`o outro computador respondeu ${response.status}`)
    }
  }
}

const ownAddresses = (): Set<string> =>
  new Set(
    Object.values(networkInterfaces())
      .flat()
      .map((info) => info?.address ?? '')
  )

/** Procura outros Horizontes no modo Mouse por 1,5 s, sem contar este PC. */
async function browse(): Promise<Host[]> {
  const bonjour = new Bonjour()
  const own = ownAddresses()
  const found = new Map<string, Host>()
  const browser = bonjour.find({ type: SERVICE_TYPE }, (service) => {
    const address = [...(service.addresses ?? []), service.referer?.address ?? ''].find(
      (candidate) => /^\d+\.\d+\.\d+\.\d+$/.test(candidate) && !own.has(candidate)
    )
    if (address) found.set(address, { name: service.name, address })
  })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  browser.stop()
  bonjour.destroy()
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function advertise(name: string): () => void {
  const bonjour = new Bonjour()
  const service = bonjour.publish({ name, type: SERVICE_TYPE, port: MOUSE_CHANNEL_PORT })
  return () => {
    service.stop?.()
    bonjour.destroy()
  }
}

const succeeds = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => execFile(command, args, { timeout: 15_000 }, (error) => resolve(!error)))

/**
 * Como chamar o `deskflow-core`. Windows: zip portátil baixado e conferido, numa pasta por versão. Linux: o
 * Deskflow instalado (nativo ou Flatpak).
 */
function deskflowCommand(deps: {
  dir: string
  download(zip: string): Promise<void>
  extract(zip: string, into: string): Promise<void>
}): () => Promise<DeskflowCommand> {
  return async () => {
    if (process.platform === 'win32') {
      const into = join(deps.dir, DESKFLOW_WINDOWS.version)
      const find = (): string | null => {
        if (!existsSync(into)) return null
        for (const entry of readdirSync(into)) {
          const exe = join(into, entry, 'deskflow-core.exe')
          if (existsSync(exe)) return exe
        }
        return null
      }
      let exe = find()
      if (!exe) {
        const zip = join(deps.dir, DESKFLOW_WINDOWS.fileName)
        await mkdir(deps.dir, { recursive: true })
        await deps.download(zip)
        await deps.extract(zip, into)
        exe = find()
      }
      if (!exe) throw new Error('O pacote do Deskflow veio sem o deskflow-core.exe.')
      return { command: exe, prefix: [] }
    }
    if (await succeeds('sh', ['-c', 'command -v deskflow-core'])) {
      return { command: 'deskflow-core', prefix: [] }
    }
    if (await succeeds('flatpak', ['info', 'org.deskflow.deskflow'])) {
      return {
        command: 'flatpak',
        prefix: ['run', '--command=deskflow-core', 'org.deskflow.deskflow']
      }
    }
    throw new Error('Instale o Deskflow neste computador para usar o modo Mouse.')
  }
}

export function createRealMouseEngine(deps: {
  userData: string
  download(zip: string): Promise<void>
  extract(zip: string, into: string): Promise<void>
}): MouseEngine {
  const dir = join(deps.userData, 'deskflow')
  const share = createMouseShare({
    command: deskflowCommand({ dir, download: deps.download, extract: deps.extract }),
    dir,
    writeFile: async (path, text) => {
      await mkdir(dir, { recursive: true })
      await writeFile(path, text)
    },
    join,
    spawn: async (command, args) => {
      const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      return {
        kill: () => void child.kill(),
        onExit: (listener) => void child.once('exit', listener)
      }
    }
  })
  return createMouseEngine({ share, channel: createChannel(), advertise, browse })
}
