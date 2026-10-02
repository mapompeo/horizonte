import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { CHANNELS } from '../shared/api'
import { isUiEvent } from '../shared/events'
import type { SettingsPatch } from '../shared/types'
import { createController, type Controller } from './core/controller'
import { createSettingsStore } from './core/settings'
import { runDevDemo } from './dev-demo'
import { composeEngine } from './engine/compose'
import { FakeEngine } from './engine/fake'
import { SunshineApi } from './engine/sunshine/api'
import { SunshineEngine } from './engine/sunshine/engine'
import { readLogTail } from './engine/sunshine/log-file'
import { createEngineMemory } from './engine/sunshine/memory'
import { existingDisplay, existingInstaller, readDevEngineConfig } from './platform/existing'

function createWindow(controller: Controller): void {
  const window = new BrowserWindow({
    title: 'Horizonte',
    width: 760,
    height: 580,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101012' : '#FBFBFD',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
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

  const store = createSettingsStore(join(app.getPath('userData'), 'settings.json'))
  const fake = new FakeEngine(is.dev ? 700 : 0)
  const dev = readDevEngineConfig(process.env)
  const engine = dev
    ? composeEngine(
        new SunshineEngine({
          installer: existingInstaller(),
          display: existingDisplay(),
          memory: createEngineMemory(join(app.getPath('userData'), 'engine.json')),
          credentials: async () => dev.credentials,
          createApi: (credentials) =>
            new SunshineApi({
              port: credentials.port,
              username: credentials.username,
              password: credentials.password
            }),
          readLog: () => readLogTail(dev.logPath),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        }),
        fake
      )
    : fake
  const controller = await createController({ engine, store })
  if (!dev && !app.isPackaged) runDevDemo(controller, fake)

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
