import { app, powerSaveBlocker, screen, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureMotorFirewall } from '../../platform/linux/firewall'
import type { DeviceKind } from '../../../shared/device'
import type { ScreenPlacement } from '../../../shared/types'
import type { createPresence } from '../presence'
import {
  createLinuxVirtualScreen,
  framesSocket,
  gnomeFrames,
  handleCaptureRequests,
  listenReports,
  motorWindow,
  primarySize,
  windowMedia,
  type WindowReports
} from './electron'
import { WebRtcEngine, type MotorWindows, type ReceiverWindow } from './engine'

const log = (...parts: unknown[]): void => console.log('[motor]', ...parts)

/**
 * Linux: libera a sinalização e a página do navegador no ufw, se ele estiver ligado (o sistema pede a senha uma vez).
 * A v1 só liberava a sinalização: quem já tinha liberado libera de novo, agora com a página.
 */
async function linuxFirewall(): Promise<void> {
  const marker = join(app.getPath('userData'), 'firewall-motor-v3')
  const result = await ensureMotorFirewall({
    readConfig: () => readFile('/etc/ufw/ufw.conf', 'utf8').catch(() => null),
    marked: async () => existsSync(marker),
    mark: () => writeFile(marker, ''),
    runPrivileged: (script) =>
      new Promise((resolve, reject) =>
        execFile('pkexec', ['sh', '-c', script], { timeout: 300_000 }, (error) =>
          error ? reject(error) : resolve()
        )
      )
  })
  if (result === 'opened') log('firewall liberado para a conexão')
}

/**
 * As janelas do motor no app: uma oculta para enviar a cada aparelho conectado (a primeira fica aberta e também diz a
 * identidade deste aparelho; as outras fecham quando o aparelho sai) e uma em tela cheia para mostrar.
 */
function appWindows(): MotorWindows {
  const hidden = (): { window: BrowserWindow; reports: WindowReports } => {
    const window = motorWindow(
      { role: 'send', synthetic: false, testFrames: null, showStats: false },
      { show: false, width: 320, height: 200 }
    )
    return { window, reports: listenReports(window.webContents, () => undefined) }
  }
  let first: { window: BrowserWindow; reports: WindowReports } | null = null
  let firstBusy = false
  const main = (): { window: BrowserWindow; reports: WindowReports } => {
    if (!first || first.window.isDestroyed()) first = hidden()
    return first
  }

  return {
    identity: () => main().reports.identity(),
    sendMedia(hooks) {
      if (!firstBusy) {
        firstBusy = true
        return windowMedia(main().window, {
          ...hooks,
          afterStop: () => {
            firstBusy = false
            hooks.afterStop?.()
          }
        })
      }
      // Mais um aparelho ao mesmo tempo: uma janela só dele, que espera a página carregar antes de começar.
      const extra = hidden()
      return windowMedia(
        extra.window,
        {
          ...hooks,
          afterStop: () => {
            hooks.afterStop?.()
            setTimeout(() => {
              if (!extra.window.isDestroyed()) extra.window.destroy()
            }, 1000)
          }
        },
        extra.reports.identity()
      )
    },
    async openReceiver(): Promise<ReceiverWindow> {
      // Abre na tela onde está o mouse: é onde a pessoa está olhando.
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      const window = motorWindow(
        { role: 'receive', synthetic: false, testFrames: null, showStats: false },
        { ...display.bounds, fullscreen: true, frame: false, show: true }
      )
      const quitListeners: (() => void)[] = []
      const reports = listenReports(window.webContents, (report) => {
        if (report.type === 'quit') quitListeners.forEach((quit) => quit())
      })
      const blocker = powerSaveBlocker.start('prevent-display-sleep')
      let closing = false
      window.on('closed', () => {
        powerSaveBlocker.stop(blocker)
        if (!closing) quitListeners.forEach((quit) => quit())
      })
      const codecs = await reports.codecs()
      return {
        codecs,
        size: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor)
        },
        scale: display.scaleFactor,
        media: () => windowMedia(window),
        onQuit: (callback) => quitListeners.push(callback),
        close: () => {
          closing = true
          if (!window.isDestroyed()) window.close()
        }
      }
    }
  }
}

/**
 * O motor próprio montado para o app. A tela estendida usa o monitor virtual do GNOME quando houver (no Wayland, sem o
 * seletor de tela); sem ele, a tela principal é espelhada.
 */
export function createAppWebRtcEngine(deps: {
  presence: ReturnType<typeof createPresence>
  deviceName(): string
  kind(): DeviceKind
  placementFor(fingerprint: string): ScreenPlacement | null
  defaultPlacement(): ScreenPlacement
}): WebRtcEngine {
  const gnome = process.platform === 'linux' && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')
  // Um monitor virtual (e um socket de imagens) por aparelho conectado ao mesmo tempo.
  const screens = gnome
    ? (index: number) => {
        const frames = gnomeFrames() ? framesSocket(index) : null
        return { screen: createLinuxVirtualScreen(frames), frames }
      }
    : null
  const engine = new WebRtcEngine({
    windows: appWindows(),
    presence: {
      setSending: (info) => deps.presence.setSending(info),
      hosts: () => deps.presence.senders()
    },
    screens,
    deviceName: deps.deviceName,
    kind: deps.kind,
    placementFor: deps.placementFor,
    defaultPlacement: deps.defaultPlacement,
    screenSize: primarySize,
    ...(process.platform === 'linux' ? { prepareSystem: linuxFirewall } : {}),
    log
  })
  handleCaptureRequests(() => engine.target())
  return engine
}
