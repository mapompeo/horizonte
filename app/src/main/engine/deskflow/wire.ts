import { execFile, spawn } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { Bonjour } from 'bonjour-service'
import type { Host } from '../../../shared/types'
import type { MouseEngine } from '../port'
import { createFileClipboard, type FileClipboardDeps } from './files'
import { createMouseEngine, MOUSE_CHANNEL_PORT, type MouseChannel } from './mouse-engine'
import { createMouseShare, type DeskflowCommand } from './session'
import { downloadVerified } from '../../platform/windows/download'
import { ensureDeskflowLinux, FLATPAK_APP } from './linux-install'
import { DESKFLOW_WINDOWS, deskflowLinuxFor } from './versions'

const SERVICE_TYPE = 'horizonte-mouse'
const MAX_BODY = 2048

/** Canal HTTP do modo Mouse: só aceita POST com JSON pequeno; o resto é recusado. */
function createChannel(): MouseChannel {
  let server: Server | null = null
  return {
    async listen(onMessage, serve) {
      if (server) return
      const created = createServer((request, response) => {
        if (request.method === 'GET') {
          // Arquivo copiado, só para o outro lado da conversa (quem decide é o `serve`).
          const file = serve?.(request.url ?? '', request.socket.remoteAddress ?? '') ?? null
          if (!file) return void response.writeHead(404).end()
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' })
          return void createReadStream(file)
            .on('error', () => response.destroy())
            .pipe(response)
        }
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

/** Roda e rejeita com a mensagem de erro do processo. */
const run = (command: string, args: string[], timeout: number): Promise<void> =>
  new Promise((resolve, reject) =>
    execFile(command, args, { timeout }, (error, _out, stderr) =>
      error ? reject(new Error(String(stderr).trim() || error.message)) : resolve()
    )
  )

const succeeds = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => execFile(command, args, { timeout: 15_000 }, (error) => resolve(!error)))

/**
 * Como chamar o `deskflow-core`. Windows: zip portátil baixado e conferido, numa pasta por versão. Linux: o
 * Deskflow instalado, ou instalado agora (pacote nativo, ou o Flatpak onde não há pacote).
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
    return ensureDeskflowLinux({
      has: (command) => succeeds('sh', ['-c', `command -v ${command}`]),
      flatpakHasApp: () => succeeds('flatpak', ['info', FLATPAK_APP]),
      // Lido só na hora de instalar: o arquivo existe apenas no Linux.
      pkg: () => deskflowLinuxFor(readFileSync('/etc/os-release', 'utf8'), process.arch),
      download: (pkg, dest) => downloadVerified(pkg, dest),
      // O pkexec mostra o aviso de senha do sistema (polkit) uma única vez.
      runPrivileged: (script) => run('pkexec', ['sh', '-c', script], 600_000),
      runUser: (script) => run('sh', ['-c', script], 600_000),
      workDir: tmpdir()
    })
  }
}

/**
 * Windows: um PowerShell leve avisa quando a lista de arquivos copiados muda (só enquanto o mouse está
 * compartilhado) e o Set-Clipboard -Path deixa os arquivos recebidos prontos para colar no Explorer.
 */
const WATCH_SCRIPT = [
  "$last = ''",
  'while ($true) {',
  "  $files = ''",
  "  try { $files = @((Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue).FullName) -join '|' } catch { }",
  '  if ($files -ne $last) { [Console]::Out.WriteLine($files); [Console]::Out.Flush(); $last = $files }',
  '  Start-Sleep -Milliseconds 800',
  '}'
].join('\n')

function windowsClipboard(
  runPowerShell: (script: string) => Promise<unknown>
): Pick<FileClipboardDeps, 'watch' | 'setClipboard'> {
  if (process.platform !== 'win32') {
    // Linux: só o texto copiado vai junto por enquanto (pelo próprio Deskflow).
    return { watch: () => () => undefined, setClipboard: async () => undefined }
  }
  return {
    watch(onChange) {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-Command', WATCH_SCRIPT],
        {
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true
        }
      )
      let buffer = ''
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let line: number
        while ((line = buffer.indexOf('\n')) >= 0) {
          const text = buffer.slice(0, line).trim()
          buffer = buffer.slice(line + 1)
          onChange(text ? text.split('|') : [])
        }
      })
      return () => void child.kill()
    },
    async setClipboard(paths) {
      const list = paths.map((path) => `'${path.replace(/'/g, "''")}'`).join(',')
      await runPowerShell(`Set-Clipboard -Path ${list}`)
    }
  }
}

export function createRealMouseEngine(deps: {
  userData: string
  download(zip: string): Promise<void>
  extract(zip: string, into: string): Promise<void>
  runPowerShell(script: string): Promise<unknown>
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
  const channel = createChannel()
  const files = createFileClipboard({
    ...windowsClipboard(deps.runPowerShell),
    sizeOf: async (path) => {
      const info = await stat(path).catch(() => null)
      return info?.isFile() ? info.size : null
    },
    baseName: (path) => basename(path),
    newInbox: async () => {
      const inbox = join(dir, 'recebidos', String(Date.now()))
      await mkdir(inbox, { recursive: true })
      return inbox
    },
    join,
    download: async (from, file, dest) => {
      const host = from.includes(':') ? `[${from}]` : from
      const response = await fetch(`http://${host}:${MOUSE_CHANNEL_PORT}/mouse/file/${file.id}`)
      if (!response.ok || !response.body)
        throw new Error(`o outro computador respondeu ${response.status}`)
      await pipeline(Readable.fromWeb(response.body as WebReadableStream), createWriteStream(dest))
      // Arquivo cortado no meio não fica para colar.
      if ((await stat(dest)).size !== file.size) {
        await rm(dest, { force: true })
        throw new Error('O arquivo chegou incompleto.')
      }
    },
    offer: (to, offered) => channel.send(to, '/mouse/files', { files: offered })
  })
  return createMouseEngine({ share, channel, advertise, browse, files })
}
