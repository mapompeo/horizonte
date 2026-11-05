import { app } from 'electron'
import { execFile, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { connect as netConnect, createServer as createNetServer, type Socket } from 'node:net'
import { createInterface } from 'node:readline'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { advertiseService, browseService } from '../lan'
import { isDeviceKind, type DeviceKind } from '../../../shared/device'
import type { Host, ScreenSize } from '../../../shared/types'
import type { MouseEngine } from '../port'
import { createFileClipboard, type FileClipboardDeps } from './files'
import { LINUX_TEXT_SCRIPT } from './linux-text'
import {
  createMouseEngine,
  MAX_TEXT_CHARS,
  MOUSE_CHANNEL_PORT,
  type MouseChannel,
  type MouseEngineDeps
} from './mouse-engine'
import { createMouseShare, type DeskflowCommand, type MouseShare } from './session'
import { createNativeMouseShare, NATIVE_MOUSE_PORT } from '../native-mouse/native-share'
import { linuxFirewall } from '../webrtc/wire'
import { downloadVerified } from '../../platform/windows/download'
import { ensureDeskflowLinux, FLATPAK_APP } from './linux-install'
import { DESKFLOW_WINDOWS, deskflowLinuxFor } from './versions'

const SERVICE_TYPE = 'horizonte-mouse'
/** Cabe um texto copiado inteiro (até MAX_TEXT_CHARS, em UTF-8 e com escapes do JSON). */
const MAX_BODY = 2_000_000

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

/** Procura outros Horizontes no modo Mouse, com o tamanho da tela e o tipo de aparelho que eles anunciam. */
async function browse(): Promise<Host[]> {
  const found = await browseService(SERVICE_TYPE)
  return found.map(({ name, address, txt }) => {
    const width = Number(txt.w)
    const height = Number(txt.h)
    const screen =
      width > 0 && height > 0 && width < 100_000 && height < 100_000 ? { width, height } : undefined
    return {
      name,
      address,
      ...(screen ? { screen } : {}),
      ...(isDeviceKind(txt.k) ? { kind: txt.k } : {}),
      ...(txt.n === '1' ? { nativeMouse: true } : {})
    }
  })
}

function advertise(
  name: string,
  screen: ScreenSize,
  kind: DeviceKind,
  native: boolean
): () => void {
  return advertiseService(name, SERVICE_TYPE, MOUSE_CHANNEL_PORT, {
    w: String(screen.width),
    h: String(screen.height),
    k: kind,
    ...(native ? { n: '1' } : {})
  })
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
      workDir: tmpdir(),
      configDir: deps.dir
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

/**
 * Texto copiado que o Deskflow não leva. Linux (GNOME): um observador do Mutter avisa cada texto copiado aqui;
 * o que vem do outro PC o próprio Deskflow já põe no Linux. Windows: o texto que vem do Linux vai para a área de
 * transferência (o que sai do Windows o Deskflow leva).
 */
function textClipboard(deps: {
  writeText(text: string): void
  readText(): Promise<string> | string
}): NonNullable<MouseEngineDeps['text']> {
  if (process.platform !== 'linux') {
    return {
      start: () => undefined,
      stop: () => undefined,
      // Igual ao que já está: não escreve de novo, senão o Deskflow manda de volta a cada troca de tela.
      write: (text) =>
        void Promise.resolve(deps.readText())
          .then((current) => current !== text && deps.writeText(text))
          .catch(() => undefined)
    }
  }
  let child: ReturnType<typeof spawn> | null = null
  return {
    start(onCopied) {
      child?.kill()
      const current = spawn('python3', ['-c', LINUX_TEXT_SCRIPT, String(MAX_TEXT_CHARS)], {
        stdio: ['pipe', 'pipe', 'ignore']
      })
      current.on('error', () => undefined)
      let buffer = ''
      current.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let line: number
        while ((line = buffer.indexOf('\n')) >= 0) {
          const raw = buffer.slice(0, line)
          buffer = buffer.slice(line + 1)
          try {
            const { text } = JSON.parse(raw) as { text?: unknown }
            if (typeof text === 'string') onCopied(text)
          } catch {
            // Linha que não é JSON: ignora.
          }
        }
      })
      child = current
    },
    stop() {
      child?.kill()
      child = null
    },
    write: () => undefined
  }
}

/** O auxiliar `horizonte-mouse`, se existe aqui e este GNOME captura o mouse; senão, null (fica o Deskflow). */
function nativeMouseHelper(): string | null {
  if (process.platform !== 'linux' || !/gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? ''))
    return null
  const path = app.isPackaged
    ? join(process.resourcesPath, 'horizonte-mouse')
    : join(app.getAppPath(), 'native', 'linux', 'build', 'horizonte-mouse')
  if (!existsSync(path)) return null
  return spawnSync(path, ['--check'], { timeout: 3000 }).status === 0 ? path : null
}

/** O modo Mouse sem Deskflow, com o auxiliar e a rede de verdade. */
function realNativeShare(helper: string): MouseShare {
  return createNativeMouseShare({
    spawn(mode) {
      const child = spawn(helper, [`--${mode}`], { stdio: ['pipe', 'pipe', 'inherit'] })
      const lines = createInterface({ input: child.stdout })
      child.stdin.on('error', () => undefined)
      return {
        send: (line) => void (child.stdin.writable && child.stdin.write(line)),
        onLine: (listener) => void lines.on('line', listener),
        onExit: (listener) => void child.once('exit', listener),
        kill: () => void child.kill()
      }
    },
    listen: (onSocket) =>
      new Promise((resolve, reject) => {
        const server = createNetServer((socket) =>
          onSocket(socket, (socket.remoteAddress ?? '').replace(/^::ffff:/i, ''))
        )
        server.once('error', reject)
        server.listen(NATIVE_MOUSE_PORT, () => resolve(() => void server.close()))
      }),
    connect: (address) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = netConnect(NATIVE_MOUSE_PORT, address)
        socket.once('connect', () => resolve(socket))
        socket.once('error', reject)
      }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message) => console.warn(message)
  })
}

/** Com segredo combinado, o caminho próprio; sem ele, o Deskflow (o outro lado não pode, ou é Windows ou Mac). */
function routedShare(deskflow: MouseShare, native: MouseShare): MouseShare {
  let current: MouseShare = deskflow
  const use = (next: MouseShare): void => {
    if (current !== next) current.stop()
    current = next
  }
  return {
    async share(options) {
      use(options.token ? native : deskflow)
      await current.share(options)
    },
    async follow(options) {
      use(options.token ? native : deskflow)
      await current.follow(options)
    },
    stop: () => current.stop(),
    onEnded(listener) {
      const stops = [deskflow.onEnded(listener), native.onEnded(listener)]
      return () => stops.forEach((stop) => stop())
    }
  }
}

export function createRealMouseEngine(deps: {
  userData: string
  download(zip: string): Promise<void>
  extract(zip: string, into: string): Promise<void>
  runPowerShell(script: string): Promise<unknown>
  writeText(text: string): void
  readText(): Promise<string> | string
  /** Área de trabalho deste computador (todas as telas juntas). */
  ownScreen(): ScreenSize
  /** Tipo deste aparelho, anunciado junto (o ícone nos outros PCs). */
  ownKind(): DeviceKind
}): MouseEngine {
  const dir = join(deps.userData, 'deskflow')
  const deskflow = createMouseShare({
    command: deskflowCommand({ dir, download: deps.download, extract: deps.extract }),
    dir,
    writeFile: async (path, text) => {
      await mkdir(dir, { recursive: true })
      await writeFile(path, text)
    },
    join,
    spawn: async (command, args) => {
      // A saída do Deskflow vai para um log da última sessão, para entender quando não conecta.
      await mkdir(dir, { recursive: true })
      const log = createWriteStream(
        join(dir, `${args.includes('server') ? 'server' : 'client'}.log`)
      )
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      child.stdout?.pipe(log)
      child.stderr?.pipe(log)
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
  const text = textClipboard(deps)
  const helper = nativeMouseHelper()
  const native = helper ? realNativeShare(helper) : null
  const engine = createMouseEngine({
    share: native ? routedShare(deskflow, native) : deskflow,
    channel,
    advertise: (name) => advertise(name, deps.ownScreen(), deps.ownKind(), native !== null),
    ...(native ? { nativeToken: () => randomBytes(32).toString('hex') } : {}),
    browse,
    files,
    text,
    ownScreen: deps.ownScreen
  })
  if (!native) return engine
  return {
    ...engine,
    // O modo Mouse pode ser usado sem nunca passar por Enviar: as portas dele também precisam estar liberadas aqui.
    // Se a pessoa recusar, segue: quem conecta de saída ainda funciona, e o erro aparece ao tentar.
    async start(name) {
      await linuxFirewall().catch((error: unknown) => console.warn('modo Mouse:', error))
      await engine.start(name)
    }
  }
}
