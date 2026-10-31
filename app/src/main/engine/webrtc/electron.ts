import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
  session as electronSession,
  type WebContents
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { spawn } from 'node:child_process'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { guessKind, type DeviceKind } from '../../../shared/device'
import {
  MOTOR_CHANNELS,
  type MediaMessage,
  type MotorConfig,
  type MotorReport
} from '../../../shared/motor'
import { cleanName } from '../../../shared/names'
import { createGnomeDisplay } from '../../platform/linux/gnome-display'
import { startDisplayHelper } from '../../platform/macos/helper'
import type { VirtualScreen } from './display'
import { PROTOCOL_VERSION, type Hello, type Want } from './protocol'
import type { MediaSide } from './session'

/** Peças do motor que dependem do Electron: janelas, captura e o monitor virtual do GNOME. */

const log = (...parts: unknown[]): void => console.log('[motor]', ...parts)

/** Ajustes do Chromium que precisam vir antes do `ready`. */
export function prepareMotorSwitches(): void {
  // Sem isso, o Chromium troca o IP local dos candidatos por um nome .local que o outro lado nem sempre resolve.
  app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
  // Codificação pela placa de vídeo no Linux (VA-API): sem estas, o Chromium codifica por software. A decodificação
  // pela placa já vem ligada; forçar a dela (`VaapiVideoDecodeLinuxGL`) fazia o primeiro quadro levar ~25 s.
  if (process.platform === 'linux')
    app.commandLine.appendSwitch('enable-features', 'AcceleratedVideoEncoder,VaapiVideoEncoder')
}

/** Tamanho da tela principal em pixels de verdade. */
export function primarySize(): { width: number; height: number } {
  const { size, scaleFactor } = screen.getPrimaryDisplay()
  return {
    width: Math.round(size.width * scaleFactor),
    height: Math.round(size.height * scaleFactor)
  }
}

const configs = new Map<number, MotorConfig>()
const signalTargets = new Map<number, (message: MediaMessage) => void>()
const reportListeners = new Map<number, (report: MotorReport) => void>()
const inputTargets = new Map<number, (raw: string) => void>()
let ipcWired = false

/** Liga o IPC das janelas do motor (uma vez por processo). */
export function wireMotorIpc(): void {
  if (ipcWired) return
  ipcWired = true
  ipcMain.handle(MOTOR_CHANNELS.config, (event) => configs.get(event.sender.id))
  ipcMain.on(MOTOR_CHANNELS.signal, (event, message: MediaMessage) =>
    signalTargets.get(event.sender.id)?.(message)
  )
  ipcMain.on(MOTOR_CHANNELS.report, (event, report: MotorReport) =>
    reportListeners.get(event.sender.id)?.(report)
  )
  ipcMain.on(MOTOR_CHANNELS.input, (event, raw: unknown) => {
    if (typeof raw === 'string') inputTargets.get(event.sender.id)?.(raw)
  })
}

export function motorWindow(
  config: MotorConfig,
  options: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  wireMotorIpc()
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
  const id = window.webContents.id
  configs.set(id, config)
  window.on('closed', () => {
    configs.delete(id)
    signalTargets.delete(id)
    reportListeners.delete(id)
    inputTargets.delete(id)
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    void window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/motor.html`)
  else void window.loadFile(join(__dirname, '../renderer/motor.html'))
  return window
}

export interface WindowReports {
  identity(): Promise<{ id: string; fp: string }>
  /** Quem mostra avisa que está pronto e diz o que decodifica. */
  codecs(): Promise<string[]>
}

/** Escuta os avisos da janela: a identidade sempre; quem mostra também diz que está pronto. */
export function listenReports(
  contents: WebContents,
  onReport: (report: MotorReport) => void
): WindowReports {
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

export interface WindowMediaHooks {
  /** Roda antes de a janela começar a capturar (é onde o monitor virtual é criado no tamanho pedido). */
  beforeStart?(want: Want): Promise<{ frames?: string } | void>
  afterStop?(): void
  onError?(error: Error): void
  /** Entrada que chegou de quem mostra durante a sessão (sem conferir). */
  onInput?(raw: string): void
}

/** Liga uma sessão à janela do motor. */
export function windowMedia(window: BrowserWindow, hooks: WindowMediaHooks = {}): MediaSide {
  const id = window.webContents.id
  let run = 0
  const push = (message: unknown): void => {
    if (!window.isDestroyed()) window.webContents.send(MOTOR_CHANNELS.push, message)
  }
  return {
    start(send, want) {
      const mine = ++run
      signalTargets.set(id, send)
      if (hooks.onInput) inputTargets.set(id, hooks.onInput)
      void (hooks.beforeStart?.(want) ?? Promise.resolve()).then(
        (extra) => mine === run && push({ t: 'start', want, ...(extra ?? {}) }),
        (error: unknown) => {
          const failure = error instanceof Error ? error : new Error(String(error))
          log('não consegui preparar a tela:', failure.message)
          hooks.onError?.(failure)
        }
      )
    },
    deliver: (message) => push(message),
    stop() {
      run += 1
      signalTargets.delete(id)
      inputTargets.delete(id)
      push({ t: 'stop' })
      hooks.afterStop?.()
    }
  }
}

/**
 * A captura pede a tela ao processo principal. Fora do Wayland, escolhemos aqui (a tela `target()`, ou a principal),
 * sem seletor; no Wayland, o sistema mostra o seletor dele (uma vez por execução).
 */
export function handleCaptureRequests(target: () => number | null): void {
  electronSession.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const wanted = String(target() ?? screen.getPrimaryDisplay().id)
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
}

/** O auxiliar do monitor virtual: dentro do app empacotado, ou compilado em native/linux/build. */
function linuxHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'horizonte-display')
    : join(app.getAppPath(), 'native', 'linux', 'build', 'horizonte-display')
}

/** Onde o auxiliar do GNOME publica as imagens da tela estendida (pasta do usuário, só ele acessa). */
export function framesSocket(): string {
  return join(
    process.env.XDG_RUNTIME_DIR ?? app.getPath('temp'),
    `horizonte-tela-${process.pid}.sock`
  )
}

/** GNOME no Wayland: as imagens vêm do auxiliar, sem o portal de captura (e sem o seletor dele). */
export const gnomeFrames = (): boolean =>
  process.platform === 'linux' &&
  Boolean(process.env.WAYLAND_DISPLAY) &&
  /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')

/** Monitor virtual do GNOME pelo auxiliar; com `frames`, ele também manda as imagens por esse socket. */
export function createLinuxVirtualScreen(frames: string | null): VirtualScreen {
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
            ...(frames ? ['--frames', frames] : []),
            // Mouse, teclado e toque de quem mostra agem nesta tela (sessão de controle remoto do GNOME).
            '--input'
          ])
          return {
            onStdout: (callback) => child.stdout.on('data', (chunk) => callback(String(chunk))),
            onStderr: (callback) => child.stderr.on('data', (chunk) => callback(String(chunk))),
            onExit: (callback) => child.on('exit', callback),
            onError: (callback) => child.on('error', callback),
            kill: () => child.kill('SIGTERM'),
            write: (line) => void child.stdin.write(line)
          }
        },
        10_000,
        /^READY /m
      ),
    displays: () => screen.getAllDisplays().map((d) => d.id),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  })
}

export function helloFor(
  identity: { id: string; fp: string },
  name = cleanName(hostname()) || 'Computador',
  kind: DeviceKind = guessKind(name)
): Hello {
  return {
    t: 'hello',
    v: PROTOCOL_VERSION,
    id: identity.id,
    name,
    kind,
    fp: identity.fp,
    screen: primarySize()
  }
}
