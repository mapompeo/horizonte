import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { Bonjour } from 'bonjour-service'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CHANNELS } from '../shared/api'
import { isUiEvent } from '../shared/events'
import { cleanName } from '../shared/names'
import type { SettingsPatch } from '../shared/types'
import { createController, type Controller } from './core/controller'
import { createSettingsStore } from './core/settings'
import { runDevDemo } from './dev-demo'
import { composeEngine } from './engine/compose'
import { createDiscovery } from './engine/discovery'
import { FakeEngine } from './engine/fake'
import { createMoonlightClient } from './engine/moonlight/client'
import { ensureMoonlight } from './engine/moonlight/install'
import { noClientEngine } from './engine/no-client'
import type { EnginePort } from './engine/port'
import { SunshineApi } from './engine/sunshine/api'
import { SunshineEngine } from './engine/sunshine/engine'
import { readLogTail } from './engine/sunshine/log-file'
import { createEngineMemory } from './engine/sunshine/memory'
import { downloadVerified } from './platform/windows/download'
import { psQuote } from './platform/windows/elevation'
import { runPowerShell } from './platform/windows/probes'
import { MOONLIGHT } from './platform/windows/versions'
import { existingDisplay, existingInstaller, readDevEngineConfig } from './platform/existing'
import { createWindowsPlatform, SUNSHINE_LOG, toCipher } from './platform/windows/wire'

/** Os botões de janela ficam por cima da interface, na cor do fundo e discretos. */
function overlayFor(): { color: string; symbolColor: string; height: number } {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    color: dark ? '#101012' : '#FBFBFD',
    symbolColor: dark ? '#9A9AA2' : '#6E6E73',
    height: 64
  }
}

function createWindow(controller: Controller): void {
  const window = new BrowserWindow({
    title: 'Horizonte',
    icon,
    width: 760,
    height: 580,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayFor(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101012' : '#FBFBFD',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  const refreshOverlay = (): void => {
    if (!window.isDestroyed()) window.setTitleBarOverlay(overlayFor())
  }
  nativeTheme.on('updated', refreshOverlay)
  window.on('closed', () => nativeTheme.off('updated', refreshOverlay))
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const unsubscribe = controller.subscribe((snapshot) => {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.push, snapshot)
  })
  window.on('closed', unsubscribe)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function boot(): Promise<void> {
  await app.whenReady()
  electronApp.setAppUserModelId('com.horizonte.app')
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  const store = createSettingsStore(
    join(app.getPath('userData'), 'settings.json'),
    cleanName(hostname()) || undefined
  )
  const fake = new FakeEngine(is.dev ? 700 : 0)
  const dev = readDevEngineConfig(process.env)
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const memory = createEngineMemory(join(app.getPath('userData'), 'engine.json'))
  // Instalação de verdade (baixa e pede administrador): só no app empacotado ou pedindo com HORIZONTE_ENGINE=install.
  const real =
    process.platform === 'win32' &&
    (app.isPackaged || process.env['HORIZONTE_ENGINE'] === 'install')
  const discovery = createDiscovery({
    find: () => new Bonjour().find({ type: 'nvstream' }),
    ownAddresses: () =>
      Object.values(networkInterfaces())
        .flat()
        .flatMap((i) => (i ? [i.address] : []))
  })
  // O Moonlight portátil é baixado na primeira vez que a pessoa conecta (versão fixa, hash conferido).
  const moonlightDir = join(app.getPath('userData'), 'moonlight')
  const receiver =
    process.platform === 'win32'
      ? createMoonlightClient({
          listHosts: discovery.listHosts,
          spawn: async (args) => {
            const exe = await ensureMoonlight({
              dir: moonlightDir,
              exists: async (path) => existsSync(path),
              download: async (onProgress) => {
                const zip = join(app.getPath('temp'), MOONLIGHT.fileName)
                await downloadVerified(MOONLIGHT, zip, onProgress)
                return zip
              },
              extract: async (zip, into) => {
                await runPowerShell(
                  `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(into)} -Force`,
                  120_000
                )
              }
            })
            const child = spawn(exe, args, { stdio: 'ignore' })
            return {
              kill: () => void child.kill(),
              onExit: (listener) => void child.once('exit', listener)
            }
          }
        })
      : noClientEngine(discovery.listHosts)
  let engine: EnginePort = fake
  if (dev) {
    engine = composeEngine(
      new SunshineEngine({
        installer: existingInstaller(),
        display: existingDisplay(),
        memory,
        credentials: async () => dev.credentials,
        createApi: (credentials) =>
          new SunshineApi({
            port: credentials.port,
            username: credentials.username,
            password: credentials.password
          }),
        readLog: () => readLogTail(dev.logPath),
        sleep
      }),
      receiver
    )
  } else if (real) {
    const platform = createWindowsPlatform({
      userData: app.getPath('userData'),
      cipher: toCipher(safeStorage),
      sleep,
      confirmDriverTrust: async () => {
        const answer = await dialog.showMessageBox({
          type: 'warning',
          title: 'Autorizar o monitor virtual',
          message: 'O Horizonte precisa instalar um driver de monitor virtual.',
          detail:
            'O driver é de código aberto (Virtual Display Driver) e tem certificado próprio, que o Windows só aceita se for confiado como autoridade raiz. O Horizonte confia nele apenas durante a instalação e o remove em seguida. Só continue se você confia nessa origem.',
          buttons: ['Autorizar e instalar', 'Cancelar'],
          defaultId: 1,
          cancelId: 1,
          noLink: true
        })
        return answer.response === 0
      }
    })
    engine = composeEngine(
      new SunshineEngine({
        installer: platform.installer,
        display: platform.display,
        memory,
        credentials: platform.credentials,
        createApi: platform.createApi,
        readLog: () => readLogTail(SUNSHINE_LOG),
        sleep,
        restart: platform.restart,
        // Na primeira partida o motor testa todos os codificadores e leva mais de 30 segundos.
        timing: { restartTimeoutMs: 120_000 }
      }),
      receiver
    )
  }
  const controller = await createController({ engine, store })
  if (!dev && !real && !app.isPackaged) runDevDemo(controller, fake)

  ipcMain.handle(CHANNELS.snapshot, () => controller.getSnapshot())
  ipcMain.handle(CHANNELS.dispatch, (_event, payload: unknown) => {
    if (isUiEvent(payload)) controller.dispatch(payload)
  })
  ipcMain.handle(CHANNELS.updateSettings, (_event, patch: unknown) =>
    controller.updateSettings(
      (typeof patch === 'object' && patch !== null ? patch : {}) as SettingsPatch
    )
  )
  ipcMain.handle(CHANNELS.hosts, () => controller.listHosts())

  createWindow(controller)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(controller)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

void boot()
