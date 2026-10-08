import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  session,
  shell
} from 'electron'
import { spawn } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir, hostname, networkInterfaces, release as osRelease } from 'node:os'
import { join } from 'node:path'
import { Bonjour } from 'bonjour-service'
import { autoUpdater } from 'electron-updater'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CHANNELS, REPO_URL } from '../shared/api'
import { isUiEvent } from '../shared/events'
import { cleanName } from '../shared/names'
import type { SettingsPatch } from '../shared/types'
import { createController, type Controller } from './core/controller'
import { createUpdater } from './core/updater'
import { createUninstaller } from './core/uninstall'
import { buildDiagnostic } from './core/diagnostic'
import { createDiagnosticHistory } from './core/diagnostic-history'
import { createSettingsStore } from './core/settings'
import { createAutostart } from './platform/autostart'
import { finishStartup, runStartup } from './startup'
import { runDevDemo } from './dev-demo'
import { composeEngine } from './engine/compose'
import { createDiscovery } from './engine/discovery'
import { createPinChannel, sendPin } from './engine/pin-channel'
import { FakeEngine } from './engine/fake'
import { waitForExit } from './engine/moonlight/run'
import { createMoonlightClient } from './engine/moonlight/client'
import { createPairedHostsStore } from './engine/moonlight/paired-hosts'
import { ensureMoonlight } from './engine/moonlight/install'
import type { EnginePort } from './engine/port'
import { SunshineApi } from './engine/sunshine/api'
import { SunshineEngine } from './engine/sunshine/engine'
import { readLogTail } from './engine/sunshine/log-file'
import { createEngineMemory } from './engine/sunshine/memory'
import { downloadVerified } from './platform/windows/download'
import { psQuote } from './platform/windows/elevation'
import { runPowerShell } from './platform/windows/probes'
import { MOONLIGHT } from './platform/windows/versions'
import {
  createLinuxPlatform,
  createMoonlightLauncher as createLinuxMoonlightLauncher,
  SUNSHINE_LOG as LINUX_SUNSHINE_LOG
} from './platform/linux/wire'
import { createRealGateway } from './web/wire'
import {
  createMacPlatform,
  createMoonlightLauncher,
  SUNSHINE_LOG as MAC_SUNSHINE_LOG
} from './platform/macos/wire'
import { existingDisplay, existingInstaller, readDevEngineConfig } from './platform/existing'
import { createWindowsPlatform, SUNSHINE_LOG, toCipher } from './platform/windows/wire'

// Um pareamento de verdade leva segundos; passou disso, o Moonlight travou (e o list confere se pareou).
const PAIR_TIMEOUT_MS = 60_000
// O list responde em segundos quando o aparelho está pareado.
const LIST_TIMEOUT_MS = 20_000

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
    // Windows e Linux: botões da janela por cima da interface. No macOS são os três botões nativos, num ponto fixo
    // dentro da barra de 64 px (o CSS reserva o espaço à esquerda).
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 20, y: 25 } }
      : { titleBarOverlay: overlayFor() }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101012' : '#FBFBFD',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  // Só Windows e Linux têm a barra por cima: no macOS os botões são nativos e não mudam de cor.
  if (process.platform !== 'darwin') {
    const refreshOverlay = (): void => {
      if (!window.isDestroyed()) window.setTitleBarOverlay(overlayFor())
    }
    nativeTheme.on('updated', refreshOverlay)
    window.on('closed', () => nativeTheme.off('updated', refreshOverlay))
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

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
  // O app não usa câmera, microfone, localização nem nada parecido: nega qualquer pedido.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  const persisted = createSettingsStore(
    join(app.getPath('userData'), 'settings.json'),
    cleanName(hostname()) || undefined
  )
  const autostart = createAutostart({
    platform: process.platform,
    executable: process.env.APPIMAGE || process.execPath,
    configDir: process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    native: (on) => app.setLoginItemSettings({ openAtLogin: on })
  })
  const store = {
    load: persisted.load,
    save: async (settings: Parameters<typeof persisted.save>[0]): Promise<void> => {
      const previous = await persisted.load()
      if (app.isPackaged && settings.autostart !== previous.autostart)
        await autostart.set(settings.autostart)
      try {
        await persisted.save(settings)
      } catch (cause) {
        if (app.isPackaged && settings.autostart !== previous.autostart)
          await autostart.set(previous.autostart)
        throw cause
      }
    }
  }
  const fake = new FakeEngine(is.dev ? 700 : 0)
  const dev = readDevEngineConfig(process.env)
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const memory = createEngineMemory(join(app.getPath('userData'), 'engine.json'))
  // Instalação de verdade (baixa e pede administrador): só no app empacotado ou pedindo com HORIZONTE_ENGINE=install.
  const real =
    process.platform === 'win32' &&
    (app.isPackaged || process.env['HORIZONTE_ENGINE'] === 'install')
  const realLinux =
    process.platform === 'linux' &&
    (app.isPackaged || process.env['HORIZONTE_ENGINE'] === 'install')
  const realMac =
    process.platform === 'darwin' &&
    (app.isPackaged || process.env['HORIZONTE_ENGINE'] === 'install')
  const discovery = createDiscovery({
    find: () => {
      const bonjour = new Bonjour()
      const browser = bonjour.find({ type: 'nvstream' })
      return {
        on: (_event, listener) => browser.on('up', listener),
        stop: () => {
          browser.stop()
          bonjour.destroy()
        }
      }
    },
    ownAddresses: () =>
      Object.values(networkInterfaces())
        .flat()
        .flatMap((i) => (i ? [i.address] : [])),
    localNetworks: () =>
      Object.values(networkInterfaces())
        .flat()
        .flatMap((i) =>
          i && i.family === 'IPv4' ? [{ address: i.address, netmask: i.netmask }] : []
        )
  })
  // O Moonlight portátil é baixado na primeira vez que a pessoa conecta (versão fixa, hash conferido).
  const moonlightDir = join(app.getPath('userData'), 'moonlight')
  const windowsMoonlightExe = (): Promise<string> =>
    ensureMoonlight({
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
  // Cada sistema tem o seu jeito de instalar o Moonlight (zip portátil no Windows, disco .dmg no Mac, AppImage no Linux).
  const moonlightExe =
    process.platform === 'darwin'
      ? createMoonlightLauncher(app.getPath('userData'))
      : process.platform === 'linux'
        ? createLinuxMoonlightLauncher(app.getPath('userData'))
        : windowsMoonlightExe
  // O AppImage abre sem precisar do FUSE (que falta no Ubuntu 24.04 de fábrica).
  const clientEnv =
    process.platform === 'linux' ? { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } : process.env
  const receiver = createMoonlightClient({
    listHosts: discovery.listHosts,
    sendPin,
    pairedHosts: createPairedHostsStore(join(app.getPath('userData'), 'paired-hosts.json')),
    // O Moonlight se apresenta ao outro lado com o nome do computador.
    deviceName: () => cleanName(hostname()) || 'Dispositivo',
    randomPin: () => String(randomInt(10_000)).padStart(4, '0'),
    run: async (args) => {
      const child = spawn(await moonlightExe(), args, { stdio: 'ignore', env: clientEnv })
      return waitForExit(
        { kill: () => void child.kill(), onExit: (l) => void child.once('exit', l) },
        args[0] === 'list' ? LIST_TIMEOUT_MS : PAIR_TIMEOUT_MS,
        (l) => void child.once('error', l)
      )
    },
    spawn: async (args) => {
      const child = spawn(await moonlightExe(), args, { stdio: 'ignore', env: clientEnv })
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
        pins: createPinChannel(),
        restart: platform.restart,
        // Na primeira partida o motor testa todos os codificadores e leva mais de 30 segundos.
        timing: { restartTimeoutMs: 120_000 }
      }),
      receiver
    )
  } else if (realLinux) {
    const platform = createLinuxPlatform({
      userData: app.getPath('userData'),
      cipher: toCipher(safeStorage),
      sleep
    })
    engine = composeEngine(
      new SunshineEngine({
        installer: platform.installer,
        display: platform.display,
        memory,
        credentials: platform.credentials,
        createApi: platform.createApi,
        readLog: () => readLogTail(LINUX_SUNSHINE_LOG),
        sleep,
        pins: createPinChannel(),
        restart: platform.restart,
        timing: { restartTimeoutMs: 120_000 }
      }),
      receiver
    )
  } else if (realMac) {
    const platform = createMacPlatform({
      userData: app.getPath('userData'),
      cipher: toCipher(safeStorage),
      sleep,
      // Empacotado, o auxiliar vem junto do app (extraResources); do código-fonte, da pasta onde ele é compilado.
      helperPath: app.isPackaged
        ? join(process.resourcesPath, 'horizonte-display')
        : join(app.getAppPath(), 'native', 'macos', 'build', 'horizonte-display')
    })
    app.on('before-quit', () => platform.stopVirtualDisplay())
    engine = composeEngine(
      new SunshineEngine({
        installer: platform.installer,
        display: platform.display,
        memory,
        credentials: platform.credentials,
        createApi: platform.createApi,
        readLog: () => readLogTail(MAC_SUNSHINE_LOG),
        sleep,
        pins: createPinChannel(),
        restart: platform.restart,
        timing: { restartTimeoutMs: 120_000 }
      }),
      receiver
    )
  }
  const controller = await createController({ engine, store })
  const diagnosticEnv = {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: osRelease(),
    electron: process.versions.electron,
    home: homedir()
  }
  const history = createDiagnosticHistory(
    join(app.getPath('userData'), 'diagnostic-history.json'),
    diagnosticEnv
  )
  let recordedError: unknown = null
  const rememberError = (snapshot: ReturnType<Controller['getSnapshot']>): void => {
    if (snapshot.state.screen !== 'error') {
      recordedError = null
      return
    }
    if (recordedError === snapshot.state.error) return
    recordedError = snapshot.state.error
    void history.record(snapshot).catch(() => undefined)
  }
  controller.subscribe(rememberError)
  rememberError(controller.getSnapshot())
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = app.getVersion().includes('-')
  autoUpdater.allowDowngrade = false
  const updates = createUpdater({
    supported:
      app.isPackaged &&
      process.platform !== 'darwin' &&
      (process.platform !== 'linux' || Boolean(process.env.APPIMAGE)),
    currentVersion: app.getVersion(),
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    install: () => autoUpdater.quitAndInstall(false, true),
    canInstall: () =>
      !['connected', 'receiving', 'preparing', 'approve'].includes(
        controller.getSnapshot().state.screen
      ),
    listen: (events) => {
      autoUpdater.on('update-available', (info) => events.available(info.version))
      autoUpdater.on('update-not-available', events.current)
      autoUpdater.on('download-progress', (info) => events.progress(info.percent))
      autoUpdater.on('update-downloaded', events.downloaded)
      autoUpdater.on('error', events.error)
    }
  })
  updates.subscribe((status) => {
    BrowserWindow.getAllWindows().forEach((window) =>
      window.webContents.send(CHANNELS.updatePush, status)
    )
  })
  ipcMain.handle(CHANNELS.updateStatus, () => updates.status())
  const uninstall = createUninstaller({
    platform: process.platform,
    packaged: app.isPackaged,
    executable: process.execPath,
    exists: existsSync,
    busy: () =>
      ['connected', 'receiving', 'preparing', 'approve'].includes(
        controller.getSnapshot().state.screen
      ) || ['checking', 'downloading'].includes(updates.status().phase),
    confirm: async () =>
      (
        await dialog.showMessageBox({
          type: 'question',
          title: 'Desinstalar Horizonte',
          message: 'Desinstalar o Horizonte deste dispositivo?',
          detail:
            'O desinstalador do Windows será aberto. Sunshine, Moonlight e o driver virtual são componentes separados e permanecerão instalados.',
          buttons: ['Cancelar', 'Desinstalar'],
          defaultId: 0,
          cancelId: 0
        })
      ).response === 1,
    launch: (path) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(path, [], { detached: true, stdio: 'ignore' })
        child.once('error', reject)
        child.once('spawn', () => {
          child.unref()
          resolve()
        })
      }),
    quit: () => app.quit()
  })
  ipcMain.handle(CHANNELS.uninstall, () => uninstall())
  ipcMain.handle(CHANNELS.update, (_event, action: unknown) => {
    if (action === 'check' || action === 'download' || action === 'install')
      return updates.perform(action)
    return updates.status()
  })
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
  ipcMain.handle(CHANNELS.openRepo, () => shell.openExternal(REPO_URL))
  // A área de transferência do navegador falha em alguns sistemas (visto no macOS): a cópia é feita aqui.
  ipcMain.handle(CHANNELS.copyDiagnostic, async () => {
    try {
      const recent = await history.text()
      clipboard.writeText(
        buildDiagnostic(diagnosticEnv, controller.getSnapshot()) +
          (recent ? `\n\nErros recentes (histórico local):\n${recent}` : '')
      )
      return true
    } catch {
      return false
    }
  })
  const gateway = createRealGateway({
    userData: app.getPath('userData'),
    cipher: toCipher(safeStorage),
    sleep,
    deviceName: () => controller.getSnapshot().settings.deviceName
  })
  ipcMain.handle(CHANNELS.webAccess, () => gateway.status())
  ipcMain.handle(CHANNELS.setWebAccess, (_event, on: unknown) =>
    on === true ? gateway.start() : gateway.stop().then(() => gateway.status())
  )
  app.on('before-quit', () => void gateway.stop())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(controller)
  })
  await finishStartup({
    createWindow: () => createWindow(controller),
    syncAutostart: app.isPackaged
      ? () => autostart.set(controller.getSnapshot().settings.autostart)
      : undefined,
    reportError: (error) => {
      console.error(error)
      dialog.showErrorBox(
        'Não consegui configurar a abertura com o sistema',
        `${error.message}\n\nDetalhe: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`
      )
    }
  })
  void updates.perform('check')
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Só uma cópia do app por vez (o instalador já abre uma): abrir de novo traz a janela existente para a frente.
if (!app.isPackaged || app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  void runStartup(boot, (error) => {
    console.error(error)
    try {
      dialog.showErrorBox(
        'Não consegui iniciar o Horizonte',
        `${error.message}\n\nDetalhe: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`
      )
    } finally {
      app.quit()
    }
  })
} else {
  app.quit()
}
