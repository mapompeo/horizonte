import {
  app,
  BrowserWindow,
  dialog,
  desktopCapturer,
  ipcMain,
  screen,
  session as electronSession,
  type WebContents
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { spawn } from '../../core/children'
import { allowsPermission } from '../../core/permissions'
import { existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadVerified } from '../../platform/windows/download'
import { createElevation, runWithUac } from '../../platform/windows/elevation'
import { runPowerShell } from '../../platform/windows/probes'
import { VIRTUAL_DISPLAY_DRIVER } from '../../platform/windows/versions'
import {
  createWindowsVirtualScreen,
  driverInstallScript
} from '../../platform/windows/virtual-screen'
import { guessKind, type DeviceKind } from '../../../shared/device'
import {
  MOTOR_CHANNELS,
  type MediaMessage,
  type MotorConfig,
  type MotorReport,
  type MotorStats
} from '../../../shared/motor'
import { cleanName } from '../../../shared/names'
import { placeCommand, createGnomeDisplay } from '../../platform/linux/gnome-display'
import { startDisplayHelper, type RunningDisplay } from '../../platform/macos/helper'
import type { VirtualScreen } from './display'
import { PROTOCOL_VERSION, type Hello, type Want } from './protocol'
import type { MediaSide } from './session'
import { L } from '../../../shared/lang'

/** Peças do motor que dependem do Electron: janelas, captura e o monitor virtual do GNOME. */

const log = (...parts: unknown[]): void => console.log('[motor]', ...parts)

/** Ajustes do Chromium que precisam vir antes do `ready`. */
export function prepareMotorSwitches(): void {
  // Sem isso, o Chromium troca o IP local dos candidatos por um nome .local que o outro lado nem sempre resolve.
  app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
  // Correção de perda (FlexFEC): pacotes extras que refazem os perdidos sem esperar o reenvio, o que segura o atraso
  // no Wi-Fi. Os dois lados anunciam; com quem não anuncia (um navegador, por exemplo), a sessão segue sem.
  // Sem espera para mostrar (ForcePlayoutDelay 0 a 0): o receptor do WebRTC segurava cada quadro de 300 a 650 ms para
  // "suavizar", porque os quadros de tela variam muito de tamanho (parada é quase nada, vídeo é grande). O
  // `jitterBufferTarget = 0` só zera o mínimo; aqui o máximo também é zero e o quadro aparece assim que decodifica.
  app.commandLine.appendSwitch(
    'force-fieldtrials',
    'WebRTC-FlexFEC-03/Enabled/WebRTC-FlexFEC-03-Advertised/Enabled/' +
      'WebRTC-ForcePlayoutDelay/min_ms:0,max_ms:0/'
  )
  // Codificação pela placa de vídeo no Linux (VA-API): sem estas, o Chromium codifica por software. A decodificação
  // pela placa já vem ligada; forçar a dela (`VaapiVideoDecodeLinuxGL`) fazia o primeiro quadro levar ~25 s.
  // Sem o GlobalShortcutsPortal: no Wayland ele abria a pergunta do GNOME sobre o atalho logo na primeira abertura.
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
/** As medidas de cada janela que envia, para quem pediu (a sessão do aparelho). */
const statsTargets = new Map<number, (stats: MotorStats) => void>()
/** Quem avisa que a janela de captura falhou (o erro que ela relata ou o travamento dela). */
const failureTargets = new Map<number, (error: Error) => void>()
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
  // O que a janela do motor registra (captura, codificador, conexão) vai para o log do app: no Windows não há
  // terminal, e é por esse log que se descobre por que a imagem não sai.
  window.webContents.on('console-message', (event) => {
    if (event.level !== 'debug') console.log(`[janela ${config.role}] ${event.message}`)
  })
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
  contents.once('render-process-gone', (_event, details) =>
    failureTargets.get(contents.id)?.(
      new Error(`A janela de transmissão parou (${details.reason}).`)
    )
  )
  reportListeners.set(contents.id, (report) => {
    if (report.type === 'identity') identity = { id: report.id, fp: report.fp }
    else if (report.type === 'ready') codecs = report.codecs
    else if (report.type === 'error') {
      log('erro na janela:', report.message)
      failureTargets.get(contents.id)?.(new Error(report.message))
    } else if (report.type === 'stats') statsTargets.get(contents.id)?.(report.stats)
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
  /** As medidas da conexão, uma vez por segundo. */
  onStats?(stats: MotorStats): void
}

/**
 * Liga uma sessão à janela do motor. Com `ready`, a sessão só começa quando a janela termina de carregar (uma janela
 * criada para esta sessão ainda não escuta as mensagens).
 */
export function windowMedia(
  window: BrowserWindow,
  hooks: WindowMediaHooks = {},
  ready: Promise<unknown> = Promise.resolve()
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
      if (hooks.onInput) inputTargets.set(id, hooks.onInput)
      if (hooks.onStats) statsTargets.set(id, hooks.onStats)
      if (hooks.onError) failureTargets.set(id, hooks.onError)
      void Promise.all([hooks.beforeStart?.(want), ready])
        .then(([extra]) => extra)
        .then(
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
      statsTargets.delete(id)
      failureTargets.delete(id)
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
  // A mesma política do app (negar tudo, menos a captura pedida pela janela de transmissão): o teste do envio de
  // verdade (--motor-send) passa por ela também, e a CI pega de novo o "Permission denied" que travava o Windows.
  electronSession.defaultSession.setPermissionRequestHandler((webContents, permission, callback) =>
    callback(allowsPermission(permission, webContents.getURL()))
  )
  electronSession.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    allowsPermission(permission, webContents?.getURL() ?? '')
  )
  electronSession.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    log('pedido de captura da tela')
    void desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const wanted = String(target() ?? screen.getPrimaryDisplay().id)
        const source = sources.find((s) => s.display_id === wanted) ?? sources[0]
        // Quais telas o sistema oferece e qual foi escolhida: é o que falta saber quando a imagem não chega.
        log(
          `telas para capturar: ${sources.map((s) => `${s.name} (id ${s.display_id || '?'})`).join(', ') || 'nenhuma'}; pedida: ${wanted}`
        )
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
export function framesSocket(index = 0): string {
  return join(
    process.env.XDG_RUNTIME_DIR ?? app.getPath('temp'),
    `horizonte-tela-${process.pid}${index ? `-${index + 1}` : ''}.sock`
  )
}

/** GNOME no Wayland: as imagens vêm do auxiliar, sem o portal de captura (e sem o seletor dele). */
export const gnomeFrames = (): boolean =>
  process.platform === 'linux' &&
  Boolean(process.env.WAYLAND_DISPLAY) &&
  /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')

/** O auxiliar de tela virtual do Mac, ou null quando ele não existe (código-fonte sem compilar). */
export function macHelperPath(): string | null {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'horizonte-display')
    : join(app.getAppPath(), 'native', 'macos', 'build', 'horizonte-display')
  return process.platform === 'darwin' && existsSync(path) ? path : null
}

/**
 * Mac: a tela estendida é um monitor virtual do próprio macOS (CGVirtualDisplay), um auxiliar por aparelho. O id que
 * ele devolve é o mesmo da lista do Electron. O tamanho fica dentro do que o auxiliar aceita.
 */
export function createMacVirtualScreen(helper: string, index: number): VirtualScreen {
  let running: RunningDisplay | null = null
  let size = ''
  const seen = (id: number): number | null =>
    screen.getAllDisplays().some((display) => display.id === id) ? id : null
  return {
    async ensure(request) {
      const width = Math.max(640, Math.min(7680, request.width))
      const height = Math.max(480, Math.min(4320, request.height))
      const key = `${width}x${height}`
      if (running && size === key) return seen(running.displayId)
      running?.stop()
      running = await startDisplayHelper(() => {
        const child = spawn(helper, [
          '--width',
          String(width),
          '--height',
          String(height),
          '--name',
          index ? `Horizonte ${index + 1}` : 'Horizonte',
          '--serial',
          String(index + 1)
        ])
        // A posição pedida no mapa chega ao auxiliar por linhas na entrada padrão, como no Linux.
        child.stdin.on('error', () => undefined)
        child.stderr.on('data', (chunk) => console.warn(`[tela estendida] ${String(chunk).trim()}`))
        child.stdout.on('data', (chunk) => {
          for (const line of String(chunk).split('\n'))
            if (line.startsWith('PLACED')) console.log(`[tela estendida] ${line}`)
        })
        return {
          onStdout: (callback) => child.stdout.on('data', (chunk) => callback(String(chunk))),
          onStderr: (callback) => child.stderr.on('data', (chunk) => callback(String(chunk))),
          onExit: (callback) => child.on('exit', callback),
          onError: (callback) => child.on('error', callback),
          kill: () => child.kill('SIGTERM'),
          write: (line) => void child.stdin.write(line)
        }
      })
      size = key
      // O macOS leva um instante para pôr a tela nova na lista.
      for (let tries = 0; tries < 20 && seen(running.displayId) === null; tries++)
        await new Promise((resolve) => setTimeout(resolve, 100))
      return seen(running.displayId)
    },
    async release() {
      running?.stop()
      running = null
      size = ''
    },
    async place(placement) {
      running?.send?.(placeCommand(placement))
    }
  }
}

/** Windows: o monitor do driver de tela virtual (instalado na primeira vez, com a autorização da pessoa). */
export function createWindowsScreen(): VirtualScreen {
  return createWindowsVirtualScreen({
    run: (script) => runPowerShell(script, 30_000),
    async installDriver() {
      // Uma vez só, na primeira tela estendida. O texto diz o que vem a seguir (o pedido de administrador do Windows)
      // para ninguém se assustar; o driver é o Virtual Display Driver, de código aberto, conferido pelo hash.
      const answer = await dialog.showMessageBox({
        type: 'question',
        title: L({
          pt: 'Tela a mais no Windows',
          en: 'One more screen on Windows',
          es: 'Una pantalla más en Windows'
        }),
        message: L({
          pt: 'Instalar o monitor virtual?',
          en: 'Install the virtual monitor?',
          es: '¿Instalar el monitor virtual?'
        }),
        detail: L({
          pt: 'Para o aparelho virar uma tela a mais, o Windows precisa de um monitor virtual (Virtual Display Driver, de código aberto). É uma vez só: em seguida, o Windows pede permissão de administrador.',
          en: 'For the device to become one more screen, Windows needs a virtual monitor (Virtual Display Driver, open source). It is only once: next, Windows asks for administrator permission.',
          es: 'Para que el dispositivo sea una pantalla más, Windows necesita un monitor virtual (Virtual Display Driver, de código abierto). Es una sola vez: después, Windows pide permiso de administrador.'
        }),
        buttons: [
          L({ pt: 'Instalar', en: 'Install', es: 'Instalar' }),
          L({ pt: 'Agora não', en: 'Not now', es: 'Ahora no' })
        ],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      if (answer.response !== 0)
        throw new Error('Sem o driver do monitor virtual, a tela não estende.')
      const zip = join(tmpdir(), VIRTUAL_DISPLAY_DRIVER.fileName)
      await downloadVerified(VIRTUAL_DISPLAY_DRIVER, zip)
      await createElevation({ run: runWithUac, tmpDir: tmpdir() }).runElevated([
        {
          description: 'Instalar o monitor virtual',
          script: driverInstallScript(VIRTUAL_DISPLAY_DRIVER, zip)
        }
      ])
    },
    displayAt: (x, y) =>
      screen.getAllDisplays().find((d) => d.nativeOrigin.x === x && d.nativeOrigin.y === y)?.id ??
      null,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  })
}

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
            ...(request.scale && request.scale > 1 ? ['--scale', String(request.scale)] : []),
            // O cursor à parte só faz sentido com as imagens pelo socket (é por ele que a posição vai).
            ...(frames && request.cursor ? ['--cursor'] : []),
            // Mouse, teclado e toque de quem mostra agem nesta tela (sessão de controle remoto do GNOME).
            '--input'
          ])
          // O que o auxiliar diz (posição aplicada ou recusada pelo GNOME) vai para o log do app.
          child.stderr.on('data', (chunk) =>
            console.warn(`[tela estendida] ${String(chunk).trim()}`)
          )
          child.stdout.on('data', (chunk) => {
            for (const line of String(chunk).split('\n'))
              if (line.startsWith('PLACED')) console.log(`[tela estendida] ${line}`)
          })
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
