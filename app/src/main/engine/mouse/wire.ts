import { app, clipboard, ClipboardItem } from 'electron'
import { execFile, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { connect as netConnect, createServer as createNetServer, type Socket } from 'node:net'
import { createInterface } from 'node:readline'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { advertiseService, browseService } from '../lan'
import { isDeviceKind, type DeviceKind } from '../../../shared/device'
import type { Host, ScreenSize } from '../../../shared/types'
import type { MouseEngine } from '../port'
import { createFileClipboard, type FileClipboardDeps } from './files'
import { LINUX_CLIPBOARD_SCRIPT } from './linux-clipboard'
import { parseWatchLine, PLACE_MAC, pollText, WATCH_MAC, WATCH_WINDOWS } from './clipboard-watch'
import {
  createMouseEngine,
  MAX_TEXT_CHARS,
  MOUSE_CHANNEL_PORT,
  type MouseChannel,
  type MouseEngineDeps
} from './mouse-engine'
import { createNativeMouseShare, NATIVE_MOUSE_PORT } from '../native-mouse/native-share'
import type { MouseShare } from '../native-mouse/types'
import { linuxFirewall } from '../webrtc/wire'

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

function systemClipboard(
  inbox: string,
  runPowerShell: (script: string) => Promise<unknown>
): Pick<FileClipboardDeps, 'watch' | 'setClipboard'> {
  const windows = process.platform === 'win32'
  return {
    watch(onChange) {
      void mkdir(inbox, { recursive: true }).catch(() => undefined)
      const env = { ...process.env, HZ_CLIP_DIR: inbox }
      const child = windows
        ? spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-STA', '-Command', WATCH_WINDOWS],
            {
              stdio: ['ignore', 'pipe', 'ignore'],
              windowsHide: true,
              env
            }
          )
        : spawn('osascript', ['-l', 'JavaScript', '-e', WATCH_MAC], {
            stdio: ['ignore', 'pipe', 'ignore'],
            env
          })
      child.on('error', () => undefined)
      createInterface({ input: child.stdout }).on('line', (raw) => {
        const { paths, image } = parseWatchLine(raw)
        onChange(paths, image)
      })
      return () => void child.kill()
    },
    async setClipboard(paths, image) {
      if (!windows) {
        await new Promise<void>((resolve, reject) =>
          execFile(
            'osascript',
            ['-l', 'JavaScript', '-e', PLACE_MAC, image ? 'image' : 'files', ...paths],
            { timeout: 10_000 },
            (error) => (error ? reject(error) : resolve())
          )
        )
        return
      }
      if (image) {
        const png = new Blob([await readFile(paths[0])], { type: 'image/png' })
        return clipboard.write([new ClipboardItem({ 'image/png': png })])
      }
      const list = paths.map((path) => `'${path.replace(/'/g, "''")}'`).join(',')
      await runPowerShell(`Set-Clipboard -Path ${list}`)
    }
  }
}

/**
 * Texto copiado. Linux (GNOME): o observador do Mutter avisa cada texto copiado aqui e põe o que vem do outro PC.
 * Windows e Mac: `pollText` olha a área de transferência.
 */
function textClipboard(
  deps: {
    writeText(text: string): void
    readText(): Promise<string> | string
  },
  linux: ReturnType<typeof linuxClipboard>
): NonNullable<MouseEngineDeps['text']> {
  if (process.platform !== 'linux') return pollText(deps)
  return linux.text
}

/** Uma imagem copiada vai inteira; acima disso fica de fora. */
const MAX_IMAGE_BYTES = 64 * 1024 ** 2

/**
 * Linux (GNOME): um processo só, o observador do Mutter, para texto, imagens e arquivos nos dois sentidos. Fica de pé
 * enquanto o texto ou os arquivos estiverem sendo observados (só durante o compartilhamento).
 */
function linuxClipboard(inbox: string): {
  text: NonNullable<MouseEngineDeps['text']>
  files: Pick<FileClipboardDeps, 'watch' | 'setClipboard'>
} {
  let child: ReturnType<typeof spawn> | null = null
  let onText: ((text: string) => void) | null = null
  let onFiles: ((paths: string[], image?: boolean) => void) | null = null
  const send = (message: unknown): void =>
    void (child?.stdin?.writable && child.stdin.write(`${JSON.stringify(message)}\n`))
  const update = (): void => {
    if (!onText && !onFiles) {
      child?.kill()
      child = null
      return
    }
    if (child) return
    const current = spawn(
      'python3',
      ['-c', LINUX_CLIPBOARD_SCRIPT, String(MAX_TEXT_CHARS), String(MAX_IMAGE_BYTES), inbox],
      { stdio: ['pipe', 'pipe', 'ignore'] }
    )
    current.on('error', () => undefined)
    current.stdin?.on('error', () => undefined)
    createInterface({ input: current.stdout! }).on('line', (raw) => {
      try {
        const message = JSON.parse(raw) as { text?: unknown; files?: unknown; image?: unknown }
        if (typeof message.text === 'string') onText?.(message.text)
        else if (Array.isArray(message.files))
          onFiles?.(
            message.files.filter((path): path is string => typeof path === 'string'),
            message.image === true
          )
      } catch {
        // Linha que não é JSON: ignora.
      }
    })
    child = current
  }
  return {
    text: {
      start(onCopied) {
        onText = onCopied
        update()
      },
      stop() {
        onText = null
        update()
      },
      write: (text) => send({ text })
    },
    files: {
      watch(onChange) {
        onFiles = onChange
        update()
        return () => {
          onFiles = null
          update()
        }
      },
      setClipboard: async (paths, image) => send({ files: paths, ...(image ? { image } : {}) })
    }
  }
}

/** O auxiliar `horizonte-mouse` deste sistema (no Linux, só no GNOME que captura o mouse); senão, null. */
function nativeMouseHelper(): string | null {
  const linux = process.platform === 'linux'
  if (linux && !/gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')) return null
  const file = process.platform === 'win32' ? 'horizonte-mouse.exe' : 'horizonte-mouse'
  const folder = linux ? 'linux' : process.platform === 'win32' ? 'windows' : 'macos'
  const path = app.isPackaged
    ? join(process.resourcesPath, file)
    : join(app.getAppPath(), 'native', folder, 'build', file)
  if (!existsSync(path)) return null
  return spawnSync(path, ['--check'], { timeout: 3000 }).status === 0 ? path : null
}

/** O modo Mouse, com o auxiliar e a rede de verdade. */
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

/** Sem o auxiliar (ex.: Linux fora do GNOME), o modo Mouse aparece, mas não compartilha. */
function unavailableShare(): MouseShare {
  const fail = (): Promise<never> =>
    Promise.reject(new Error('Este computador ainda não consegue compartilhar o mouse.'))
  return { share: fail, follow: fail, stop: () => undefined, onEnded: () => () => undefined }
}

export function createRealMouseEngine(deps: {
  userData: string
  runPowerShell(script: string): Promise<unknown>
  writeText(text: string): void
  readText(): Promise<string> | string
  /** Área de trabalho deste computador (todas as telas juntas). */
  ownScreen(): ScreenSize
  /** Tipo deste aparelho, anunciado junto (o ícone nos outros PCs). */
  ownKind(): DeviceKind
}): MouseEngine {
  const dir = join(deps.userData, 'mouse')
  const channel = createChannel()
  // Imagens copiadas aqui ficam nesta pasta até o outro PC baixar (só esta pessoa lê a pasta).
  const copied = join(dir, 'copiadas')
  const linux = linuxClipboard(copied)
  const files = createFileClipboard({
    ...(process.platform === 'linux' ? linux.files : systemClipboard(copied, deps.runPowerShell)),
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
  const text = textClipboard(deps, linux)
  const helper = nativeMouseHelper()
  const native = helper ? realNativeShare(helper) : null
  const engine = createMouseEngine({
    share: native ?? unavailableShare(),
    channel,
    advertise: (name) => advertise(name, deps.ownScreen(), deps.ownKind(), native !== null),
    nativeToken: () => randomBytes(32).toString('hex'),
    browse,
    files,
    text,
    ownScreen: deps.ownScreen
  })
  if (!native || process.platform !== 'linux') return engine
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
