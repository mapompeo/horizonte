import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  powerSaveBlocker,
  screen,
  session as electronSession,
  type WebContents
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { guessKind } from '../../shared/device'
import {
  MOTOR_CHANNELS,
  type MediaMessage,
  type MotorConfig,
  type MotorReport,
  type MotorRole,
  type MotorStats
} from '../../shared/motor'
import { cleanName } from '../../shared/names'
import { percentiles } from '../../shared/percentiles'
import type { VirtualScreen } from '../engine/webrtc/display'
import { PROTOCOL_VERSION, SIGNALING_PORT, type Hello, type Want } from '../engine/webrtc/protocol'
import { connect, startSender, type MediaSide } from '../engine/webrtc/session'
import { createGnomeDisplay } from '../platform/linux/gnome-display'
import { startDisplayHelper } from '../platform/macos/helper'
import type { MotorArgs } from './args'

/** Teste de ponta a ponta: tempo máximo até o quadro de teste ser conferido. */
const TEST_TIMEOUT_MS = 60_000

const log = (...parts: unknown[]): void => console.log('[motor]', ...parts)

/** Ajustes do Chromium que precisam vir antes do `ready`. */
export function prepareMotorSwitches(): void {
  // Sem isso, o Chromium troca o IP local dos candidatos por um nome .local que o outro lado nem sempre resolve.
  app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
  // Não liga a VA-API do Linux à força: com ela (Wayland, 30/10/2026) o primeiro quadro-chave do H.264 se perdia e o
  // vídeo levava ~25 s para aparecer. O Chromium escolhe sozinho; o `encoderImplementation` mostra o resultado.
}

const lanAddresses = (): string[] =>
  Object.values(networkInterfaces())
    .flat()
    .flatMap((info) => (info && info.family === 'IPv4' && !info.internal ? [info.address] : []))

/** Tamanho da tela principal em pixels de verdade. */
function primarySize(): { width: number; height: number } {
  const { size, scaleFactor } = screen.getPrimaryDisplay()
  return {
    width: Math.round(size.width * scaleFactor),
    height: Math.round(size.height * scaleFactor)
  }
}

const configs = new Map<number, MotorConfig>()
const signalTargets = new Map<number, (message: MediaMessage) => void>()
const reportListeners = new Map<number, (report: MotorReport) => void>()

function wireIpc(): void {
  ipcMain.handle(MOTOR_CHANNELS.config, (event) => configs.get(event.sender.id))
  ipcMain.on(MOTOR_CHANNELS.signal, (event, message: MediaMessage) =>
    signalTargets.get(event.sender.id)?.(message)
  )
  ipcMain.on(MOTOR_CHANNELS.report, (event, report: MotorReport) =>
    reportListeners.get(event.sender.id)?.(report)
  )
}

function motorWindow(
  config: MotorConfig,
  options: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // A janela de envio lê as imagens do auxiliar do Linux por um socket: precisa do Node no preload, e fica sem
  // isolamento de contexto para as imagens não serem copiadas de novo. Ela só carrega a página local do motor.
  const sending = config.role === 'send'
  const window = new BrowserWindow({
    title: 'Horizonte',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    ...options,
    webPreferences: {
      preload: join(__dirname, '../preload/motor.js'),
      contextIsolation: !sending,
      sandbox: !sending,
      nodeIntegration: false,
      // A janela que envia fica oculta e precisa continuar a todo vapor.
      backgroundThrottling: false
    }
  })
  configs.set(window.webContents.id, config)
  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    void window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/motor.html`)
  else void window.loadFile(join(__dirname, '../renderer/motor.html'))
  return window
}

/** Espera os avisos da janela: a identidade sempre; quem mostra também diz que está pronto. */
function listenReports(
  contents: WebContents,
  onReport: (report: MotorReport) => void
): { identity(): Promise<{ id: string; fp: string }>; codecs(): Promise<string[]> } {
  let identity: { id: string; fp: string } | null = null
  let codecs: string[] | null = null
  const waiters: (() => void)[] = []
  reportListeners.set(contents.id, (report) => {
    if (report.type === 'identity') identity = { id: report.id, fp: report.fp }
    else if (report.type === 'ready') codecs = report.codecs
    else if (report.type === 'error') log('erro na janela:', report.message)
    onReport(report)
    for (const wake of waiters.splice(0)) wake()
  })
  const until = <T>(read: () => T | null): Promise<T> =>
    new Promise((resolve) => {
      const check = (): void => {
        const value = read()
        if (value !== null) resolve(value)
        else waiters.push(check)
      }
      check()
    })
  return {
    identity: () => until(() => identity),
    codecs: () => until(() => codecs)
  }
}

/**
 * Liga a sessão à janela. `beforeStart` roda antes de a janela começar a capturar (é onde o monitor virtual é criado
 * no tamanho que quem mostra pediu).
 */
function windowMedia(
  window: BrowserWindow,
  hooks: { beforeStart?(want: Want): Promise<{ frames?: string } | void>; afterStop?(): void } = {}
): MediaSide {
  const id = window.webContents.id
  let run = 0
  const push = (message: unknown): void => {
    if (!window.isDestroyed()) window.webContents.send(MOTOR_CHANNELS.push, message)
  }
  return {
    start(send, want) {
      const mine = ++run
      signalTargets.set(id, send)
      void (hooks.beforeStart?.(want) ?? Promise.resolve()).then(
        (extra) => mine === run && push({ t: 'start', want, ...(extra ?? {}) }),
        (error: unknown) =>
          log('não consegui preparar a tela:', error instanceof Error ? error.message : error)
      )
    },
    deliver: (message) => push(message),
    stop() {
      run += 1
      signalTargets.delete(id)
      push({ t: 'stop' })
      hooks.afterStop?.()
    }
  }
}

/** O auxiliar do monitor virtual: dentro do app empacotado, ou compilado em native/linux/build. */
function linuxHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'horizonte-display')
    : join(app.getAppPath(), 'native', 'linux', 'build', 'horizonte-display')
}

/** Onde o auxiliar do GNOME publica as imagens da tela estendida (pasta do usuário, só ele acessa). */
function framesSocket(): string {
  return join(
    process.env.XDG_RUNTIME_DIR ?? app.getPath('temp'),
    `horizonte-tela-${process.pid}.sock`
  )
}

/** GNOME no Wayland: as imagens vêm do auxiliar, sem o portal de captura (e sem o seletor dele). */
const gnomeFrames = (): boolean =>
  process.platform === 'linux' &&
  Boolean(process.env.WAYLAND_DISPLAY) &&
  /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')

function createVirtualScreen(frames: string | null): VirtualScreen {
  if (process.platform !== 'linux')
    throw new Error('O modo estender do teste ainda só existe no Linux com GNOME.')
  return createGnomeDisplay({
    startHelper: (request) =>
      startDisplayHelper(
        () => {
          const child = spawn(linuxHelperPath(), [
            '--width',
            String(request.width),
            '--height',
            String(request.height),
            '--refresh',
            String(request.fps),
            ...(frames ? ['--frames', frames] : [])
          ])
          return {
            onStdout: (callback) => child.stdout.on('data', (chunk) => callback(String(chunk))),
            onStderr: (callback) => child.stderr.on('data', (chunk) => callback(String(chunk))),
            onExit: (callback) => child.on('exit', callback),
            onError: (callback) => child.on('error', callback),
            kill: () => child.kill('SIGTERM')
          }
        },
        10_000,
        /^READY /m
      ),
    displays: () => screen.getAllDisplays().map((d) => d.id),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  })
}

function hello(identity: { id: string; fp: string }): Hello {
  const name = cleanName(hostname()) || 'Computador'
  return {
    t: 'hello',
    v: PROTOCOL_VERSION,
    id: identity.id,
    name,
    kind: guessKind(name),
    fp: identity.fp,
    screen: primarySize()
  }
}

/** Guarda cada segundo de números num arquivo e resume ao fim. */
function recorder(role: MotorRole): {
  file: string
  add(stats: MotorStats): void
  summary(): string
} {
  const file = join(app.getPath('userData'), 'motor-medidas.jsonl')
  const samples: MotorStats[] = []
  let lastLog = 0
  return {
    file,
    add(stats: MotorStats) {
      samples.push(stats)
      void appendFile(file, JSON.stringify({ role, ...stats }) + '\n').catch(() => undefined)
      if (stats.at - lastLog >= 5000) {
        lastLog = stats.at
        log(
          `${stats.width}x${stats.height} ${stats.fps} fps ${stats.mbps} Mbps ${stats.codec} (${stats.implementation})` +
            ` ida e volta ${stats.rttMs ?? '?'} ms` +
            (stats.displayMs !== null ? ` recebido até a tela ${stats.displayMs} ms` : '') +
            (stats.latencyMs !== null ? ` captura até a tela ${stats.latencyMs} ms` : '') +
            (stats.qualityLimitation && stats.qualityLimitation !== 'none'
              ? ` limitado por ${stats.qualityLimitation}`
              : '')
        )
      }
    },
    summary(): string {
      const series = (pick: (s: MotorStats) => number | null): string => {
        const p = percentiles(samples.map(pick).filter((v): v is number => v !== null))
        return p
          ? `mediana ${Math.round(p.median * 10) / 10}, p95 ${Math.round(p.p95 * 10) / 10}`
          : '?'
      }
      return [
        `${samples.length} s de sessão`,
        `fps: ${series((s) => s.fps)}`,
        `Mbps: ${series((s) => s.mbps)}`,
        `captura até a tela (ms): ${series((s) => s.latencyMs)}`,
        `recebido até a tela (ms): ${series((s) => s.displayMs)}`,
        `ida e volta (ms): ${series((s) => s.rttMs)}`,
        `descartados: ${samples.at(-1)?.framesDropped ?? 0}, perdidos: ${samples.at(-1)?.packetsLost ?? 0}`,
        `números de cada segundo em ${file}`
      ].join('\n  ')
    }
  }
}

async function runSend(args: Extract<MotorArgs, { role: 'send' }>): Promise<void> {
  const frames = args.extend && gnomeFrames() ? framesSocket() : null
  const virtual = args.extend ? createVirtualScreen(frames) : null
  /** A tela que a janela captura: a do monitor virtual, quando estende; senão a principal. */
  let target: number | null = null
  const wayland = process.platform === 'linux' && Boolean(process.env.WAYLAND_DISPLAY)

  // A captura pede a tela ao processo principal. Fora do Wayland, escolhemos aqui, sem seletor; no Wayland, o
  // sistema mostra o seletor dele (uma vez por execução).
  electronSession.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (wayland && virtual && !frames)
      log('no seletor do GNOME, escolha a tela "MetaVendor" (a tela nova).')
    void desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const wanted = String(target ?? screen.getPrimaryDisplay().id)
        const source = sources.find((s) => s.display_id === wanted) ?? sources[0]
        if (!source) throw new Error('Nenhuma tela para capturar.')
        log(`capturando ${source.name}`)
        callback({ video: source })
      })
      .catch((error: unknown) => {
        log('não consegui capturar a tela:', error)
        callback({})
      })
  })

  const records = recorder('send')
  const window = motorWindow(
    { role: 'send', synthetic: args.synthetic, testFrames: null, showStats: false },
    { show: false, width: 320, height: 200 }
  )
  const reports = listenReports(window.webContents, (report) => {
    if (report.type === 'stats') records.add(report.stats)
  })
  const identity = await reports.identity()

  if (args.clock) {
    const { bounds } = screen.getPrimaryDisplay()
    motorWindow(
      { role: 'clock', synthetic: false, testFrames: null, showStats: false },
      {
        ...bounds,
        fullscreen: true
      }
    )
  }

  const sender = await startSender({
    ...(args.port !== undefined ? { port: args.port } : {}),
    hello: () => hello(identity),
    // Teste do motor: aceita qualquer um, e avisa. A aprovação de verdade entra na Fase 3.
    approve: async (peer, address) => {
      log(`${peer.name} (${address}) pediu para ver a tela: aceito sem perguntar (teste do motor).`)
      return true
    },
    media: () =>
      windowMedia(window, {
        beforeStart: async (want) => {
          if (!virtual) return
          target = await virtual.ensure({ width: want.width, height: want.height, fps: want.fps })
          log(`tela estendida criada: ${want.width}x${want.height}`)
          return frames ? { frames } : undefined
        },
        afterStop: () => {
          target = null
          void virtual?.release()
        }
      }),
    onSession(session, address) {
      log(`mostrando a tela para ${session.peer.name} (${address})`)
      session.onEnded((reason) => log(`sessão encerrada: ${reason}\n  ${records.summary()}`))
    },
    onError: (error) => log(error.message)
  })
  const blocker = powerSaveBlocker.start('prevent-app-suspension')
  app.once('before-quit', () => {
    powerSaveBlocker.stop(blocker)
    void sender.stop()
    void virtual?.release()
  })

  const addresses = lanAddresses()
  log(`pronto para enviar. Impressão digital: ${identity.fp.slice(0, 23)}…`)
  log(
    `no outro aparelho: --motor-receive=${addresses[0] ?? 'IP-DESTE-PC'}:${sender.port}` +
      (addresses.length > 1 ? `  (outros endereços: ${addresses.slice(1).join(', ')})` : '')
  )
  log(
    'qualquer aparelho da rede pode ver esta tela enquanto este teste estiver aberto. Feche para parar.'
  )
}

async function runReceive(args: Extract<MotorArgs, { role: 'receive' }>): Promise<void> {
  const testing = args.testFrames !== null
  const records = recorder('receive')
  const display = screen.getPrimaryDisplay()
  const window = motorWindow(
    { role: 'receive', synthetic: false, testFrames: args.testFrames, showStats: true },
    testing
      ? { width: 960, height: 540, show: true }
      : { ...display.bounds, fullscreen: true, frame: false, show: true }
  )

  const began = Date.now()
  let finished = false
  // Só a primeira saída vale: fechar a sessão ao sair dispara o fim de novo.
  const finish = (code: number): void => {
    if (finished) return
    finished = true
    app.exit(code)
  }
  if (testing)
    setTimeout(() => {
      log(`teste: nenhum resultado em ${TEST_TIMEOUT_MS / 1000} s`)
      finish(1)
    }, TEST_TIMEOUT_MS).unref()

  let end: () => void = () => finish(0)
  const reports = listenReports(window.webContents, (report) => {
    if (report.type === 'first-frame') log(`primeiro quadro em ${Date.now() - began} ms`)
    else if (report.type === 'stats') records.add(report.stats)
    else if (report.type === 'test-result') {
      log(`teste: ${report.ok ? 'ok' : 'FALHOU'} (${report.detail})`)
      finish(report.ok ? 0 : 1)
    } else if (report.type === 'quit') end()
  })
  const [identity, codecs] = await Promise.all([reports.identity(), reports.codecs()])

  const size = args.size ?? primarySize()
  const want: Want = { t: 'want', ...size, fps: args.fps, bitrate: args.bitrate, codecs }
  const port = args.port ?? SIGNALING_PORT
  log(
    `conectando a ${args.host}:${port} (${size.width}x${size.height}, ${args.fps} fps, ${args.bitrate} Mbps)`
  )

  const session = await connect({
    host: args.host,
    port,
    hello: hello(identity),
    want,
    media: () => windowMedia(window),
    onPending: (peer) => log(`esperando ${peer.name} permitir…`)
  })
  log(`conectado a ${session.peer.name}`)
  const blocker = powerSaveBlocker.start('prevent-display-sleep')
  end = () => session.end()
  session.onEnded((reason) => {
    powerSaveBlocker.stop(blocker)
    log(`sessão encerrada: ${reason}\n  ${records.summary()}`)
    finish(testing ? 1 : 0)
  })
  window.on('closed', () => session.end())
}

/** Abre o teste do motor no lugar do app. */
export async function runMotorBench(args: MotorArgs): Promise<void> {
  await app.whenReady()
  wireIpc()
  try {
    if (args.role === 'send') await runSend(args)
    else await runReceive(args)
  } catch (error) {
    log(error instanceof Error ? error.message : String(error))
    app.exit(1)
  }
}
