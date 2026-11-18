import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  nativeTheme,
  screen,
  session,
  shell,
  ShareMenu,
  Tray
} from 'electron'
import { execFile, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir, hostname, release as osRelease } from 'node:os'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayTemplate from '../../resources/trayTemplate.png?asset'
import trayTemplate2x from '../../resources/trayTemplate@2x.png?asset'
import { CHANNELS, REPO_URL } from '../shared/api'
import { isUiEvent } from '../shared/events'
import { cleanName } from '../shared/names'
import type { MouseSide, ScreenSize, Settings, SettingsPatch } from '../shared/types'
import { createController, type Controller } from './core/controller'
import { createUpdater } from './core/updater'
import { createTrayFollower } from './core/tray'
import { createUninstaller, UninstallCancelled } from './core/uninstall'
import { choosePlan } from './platform/uninstall-plans'
import {
  buildReportDiagnostic,
  createDiagnosticReporter,
  DIAGNOSTIC_URL
} from './core/report-diagnostic'
import { createDiagnosticHistory } from './core/diagnostic-history'
import { createSettingsStore } from './core/settings'
import { createAutostart } from './platform/autostart'
import { CLEAN_START_ENV, cleanStartCommand, hasNoNewPrivs } from './platform/linux/clean-start'
import { dockEdgeHint } from './platform/linux/dock-edge'
import { FIREWALL_COMMAND } from './platform/linux/firewall'
import { parsePowerSave, wifiPowerHint } from './platform/linux/wifi-power'
import { finishStartup, runStartup } from './startup'
import { runDevDemo } from './dev-demo'
import { MOTOR_USAGE, parseMotorArgs, type MotorArgs } from './motor/args'
import { prepareMotorSwitches, runMotorBench } from './motor/bench'
import { createAppWebRtcEngine, firewallWasRefused } from './engine/webrtc/wire'
import {
  DRIVER_DIRS,
  parseOsRelease,
  videoDriverHint,
  type VideoHint
} from './platform/linux/video-driver'
import { createRealMouseEngine } from './engine/mouse/wire'
import { advertiseService, browseService } from './engine/lan'
import { createPresence } from './engine/presence'
import { detectDeviceKind } from './platform/device-kind'
import type { DeviceKind } from '../shared/device'
import { FakeEngine } from './engine/fake'
import type { EnginePort } from './engine/port'
import { runPowerShell } from './platform/windows/probes'
import { lanAddress } from './web/wire'
import { createBrowserAccess, isLocalPageUrl } from './web/browser'

// O AppImage não tem o chrome-sandbox com permissão especial, e o Ubuntu 24.04+ (AppArmor) bloqueia o sandbox por
// namespace de usuário: sem isto o app fecha ao abrir. O .deb instala o chrome-sandbox e não precisa disso.
if (process.platform === 'linux' && process.env.APPIMAGE) app.commandLine.appendSwitch('no-sandbox')
// Fora de um desktop conhecido (i3, sway, SSH) o Electron não acha o cofre de senhas e recusa guardar a senha do
// motor; o gnome-libsecret fala com qualquer provedor do Secret Service (GNOME Keyring, KWallet, KeePassXC).
if (process.platform === 'linux' && !process.env.XDG_CURRENT_DESKTOP)
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret')

/**
 * Ícone da bandeja. No Mac, a marca de uma cor como "template": o sistema pinta de preto ou de branco conforme a
 * barra. Nos outros, o ícone do app, que aparece em barra clara ou escura.
 */
function trayImage(): Electron.NativeImage {
  if (process.platform !== 'darwin')
    return nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  const image = nativeImage.createFromPath(trayTemplate)
  image.addRepresentation({
    scaleFactor: 2,
    buffer: nativeImage.createFromPath(trayTemplate2x).toPNG()
  })
  image.setTemplateImage(true)
  return image
}

/** Os botões de janela ficam por cima da interface, na cor do fundo e discretos. */
/** Área de trabalho em pixels de verdade, com todas as telas juntas (é o que o auxiliar do mouse enxerga). */
function desktopSize(exclude: number | null = null): ScreenSize {
  const boxes = screen
    .getAllDisplays()
    .filter(({ id }) => id !== exclude)
    .map(({ bounds, scaleFactor }) => ({
      left: bounds.x * scaleFactor,
      top: bounds.y * scaleFactor,
      right: (bounds.x + bounds.width) * scaleFactor,
      bottom: (bounds.y + bounds.height) * scaleFactor
    }))
  if (boxes.length === 0) return { width: 1920, height: 1080 }
  return {
    width: Math.round(
      Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left))
    ),
    height: Math.round(
      Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top))
    )
  }
}

function overlayFor(): { color: string; symbolColor: string; height: number } {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    // Mesmo fundo da janela (--bg no CSS), para os botões não parecerem uma faixa à parte.
    color: dark ? '#000000' : '#F2F2F7',
    symbolColor: dark ? '#FFFFFF' : '#000000',
    height: 64
  }
}

/** A janela do app (o motor próprio abre outras, escondidas, para o vídeo). */
let mainWindow: BrowserWindow | null = null

/** Traz a janela para a frente. No Wayland o app não pode desminimizar nem tomar o foco: só uma janela mostrada de
 * novo (esconder e mostrar) volta para a frente com foco. */
function raiseWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return
  if (process.platform === 'linux' && !window.isFocused()) window.hide()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#F2F2F7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow = window
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

  // Conectado, a janela sai da frente e o Horizonte fica nos ícones ocultos; ao desconectar ela volta.
  let tray: Tray | null = null
  const showWindow = (): void => raiseWindow(window)
  // No Linux o ícone da bandeja só aparece com uma extensão (o GNOME padrão não tem): esconder deixaria a janela sem
  // volta. Lá ela só minimiza e continua no dock e no Alt+Tab.
  const hideWindow = (): void => {
    if (window.isDestroyed()) return
    if (process.platform === 'linux') window.minimize()
    else window.hide()
  }
  const followTray = createTrayFollower(
    { hide: hideWindow, show: showWindow },
    {
      open: () => {
        tray ??= new Tray(trayImage())
        tray.setToolTip('Horizonte: conectado')
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: 'Abrir Horizonte', click: showWindow },
            { label: 'Sair', click: () => app.quit() }
          ])
        )
        tray.on('click', showWindow)
      },
      close: () => {
        tray?.destroy()
        tray = null
      }
    }
  )

  // Aparência escolhida nos Ajustes: o Electron faz a página (prefers-color-scheme) e as barras seguirem.
  nativeTheme.themeSource = controller.getSnapshot().settings.theme
  const unsubscribe = controller.subscribe((snapshot) => {
    if (nativeTheme.themeSource !== snapshot.settings.theme)
      nativeTheme.themeSource = snapshot.settings.theme
    if (window.isDestroyed()) return
    window.webContents.send(CHANNELS.push, snapshot)
    followTray(snapshot.state)
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    unsubscribe()
    tray?.destroy()
    tray = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Linux: confere se a placa de vídeo tem o driver VA-API (sem ele, o vídeo atrasa muito). */
async function readVideoHint(sides: MouseSide[]): Promise<VideoHint | null> {
  const cards = await readdir('/sys/class/drm').catch(() => [] as string[])
  const vendors = await Promise.all(
    cards
      .filter((card) => /^card\d+$/.test(card))
      .map((card) => readFile(`/sys/class/drm/${card}/device/vendor`, 'utf8').catch(() => ''))
  )
  // HORIZONTE_DRI_DIRS: outras pastas de drivers (para testar o aviso sem desinstalar nada).
  const dirs = process.env['HORIZONTE_DRI_DIRS']?.split(':') ?? DRIVER_DIRS
  const drivers = (
    await Promise.all(dirs.map((dir) => readdir(dir).catch(() => [] as string[])))
  ).flat()
  const os = parseOsRelease(await readFile('/etc/os-release', 'utf8').catch(() => ''))
  return (
    videoDriverHint({ vendors: vendors.filter(Boolean), drivers, os }) ??
    (firewallWasRefused()
      ? {
          message: 'O firewall pode estar bloqueando a conexão. Libere com o comando:',
          command: FIREWALL_COMMAND
        }
      : null) ??
    (await readDockHint(sides)) ??
    (await readWifiHint())
  )
}

/** O dock na mesma borda de uma tela encostada (ver `dock-edge.ts`). */
async function readDockHint(sides: MouseSide[]): Promise<VideoHint | null> {
  const key = (name: string): Promise<string> =>
    new Promise((resolve) =>
      execFile(
        'gsettings',
        ['get', 'org.gnome.shell.extensions.dash-to-dock', name],
        { timeout: 2000 },
        (error, stdout) => resolve(error ? '' : stdout)
      )
    )
  const [position, autohide, pressure] = await Promise.all(
    ['dock-position', 'autohide', 'require-pressure-to-show'].map(key)
  )
  return dockEdgeHint({ position, autohide, pressure }, sides)
}

/** Linux: confere a economia de energia de cada Wi-Fi conectado (`iw`, sem precisar de sudo para ler). */
async function readWifiHint(): Promise<VideoHint | null> {
  const names = await readdir('/sys/class/net').catch(() => [] as string[])
  const wireless = (
    await Promise.all(
      names.map(async (name) => {
        const isWifi = existsSync(`/sys/class/net/${name}/wireless`)
        const up =
          (await readFile(`/sys/class/net/${name}/operstate`, 'utf8').catch(() => '')).trim() ===
          'up'
        return isWifi && up ? name : null
      })
    )
  ).filter((name): name is string => name !== null)
  const iw = ['/usr/sbin/iw', '/sbin/iw', '/usr/bin/iw'].find((path) => existsSync(path))
  if (!iw) return null
  const interfaces = await Promise.all(
    wireless.map(
      (name) =>
        new Promise<{ name: string; powerSave: boolean | null }>((resolve) =>
          execFile(iw, ['dev', name, 'get', 'power_save'], { timeout: 3000 }, (_error, stdout) =>
            resolve({ name, powerSave: parsePowerSave(String(stdout)) })
          )
        )
    )
  )
  return wifiPowerHint({ interfaces })
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
  const presence = createPresence({ advertise: advertiseService, browse: browseService })
  // Tipo deste aparelho (ícone nos outros PCs): descoberto uma vez; até lá, computador de mesa.
  let ownKind: DeviceKind = 'desktop'
  /** Nome deste aparelho nos outros: o dos ajustes, assim que o núcleo existir. */
  let ownName = (): string => cleanName(hostname()) || 'Computador'
  /** Ajustes atuais, assim que o núcleo existir. */
  let ownSettings = (): Settings | null => null
  /** A tela estendida que o motor próprio criou (fica de fora do tamanho deste computador). */
  let virtualDisplay = (): number | null => null
  /** Porta em que o motor próprio espera conexão (a página do navegador liga nela). */
  let signalingPort = (): number | null => null
  let engine: EnginePort = fake
  if (!USE_FAKE) {
    const webrtc = createAppWebRtcEngine({
      presence,
      deviceName: () => ownName(),
      kind: () => ownKind,
      // A posição de cada aparelho que já foi arrastado; os outros ficam na padrão (Ajustes > Posição da tela).
      placementFor: (fingerprint) => ownSettings()?.screenPlacements[fingerprint] ?? null,
      defaultPlacement: () => ownSettings()?.screenPlacement ?? { side: 'right' }
    })
    virtualDisplay = () => webrtc.target()
    signalingPort = () => webrtc.signalingPort()
    engine = webrtc
  }
  const kindReady = detectDeviceKind({
    platform: process.platform,
    runPowerShell: (script) => runPowerShell(script, 20_000),
    readText: (path) => readFile(path, 'utf8').catch(() => null),
    listDir: (path) => readdir(path),
    run: (command, args) =>
      new Promise((resolve) =>
        execFile(command, args, { timeout: 5000 }, (error, out) => resolve(error ? null : out))
      )
  }).then((kind) => (ownKind = kind))
  app.on('before-quit', () => presence.stop())

  // Mouse e teclado compartilhados, com o auxiliar horizonte-mouse de cada sistema.
  // No Mac, o próprio sistema pede uma vez a permissão de Acessibilidade para o mouse.
  const mouse = createRealMouseEngine({
    userData: app.getPath('userData'),
    runPowerShell: (script) => runPowerShell(script, 30_000),
    ownScreen: desktopSize,
    ownKind: () => ownKind,
    writeText: (text) => clipboard.writeText(text),
    readText: () => clipboard.readText()
  })
  app.on('before-quit', () => void mouse.stop().catch(() => undefined))
  const controller = await createController({ engine, mouse, store })
  ownName = () => controller.getSnapshot().settings.deviceName
  ownSettings = () => controller.getSnapshot().settings
  // Todo Horizonte aberto anuncia o próprio tipo, em qualquer modo (o ícone certo nas listas dos outros).
  void kindReady.then((kind) =>
    presence.announce(controller.getSnapshot().settings.deviceName, kind)
  )
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
    supported: app.isPackaged && updatesSupported(),
    // Procurar só procura: a versão nova aparece com o botão Atualizar, e baixar é escolha da pessoa.
    autoDownload: false,
    currentVersion: app.getVersion(),
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    install: () => autoUpdater.quitAndInstall(false, true),
    canInstall: () =>
      !['connected', 'receiving', 'preparing', 'approve'].includes(
        controller.getSnapshot().state.screen
      ),
    stop: () => controller.dispatch({ type: 'STOP' }),
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
  // Pronta para instalar: avisa uma vez, e o clique já reinicia atualizado.
  let announced = ''
  updates.subscribe((status) => {
    if (status.phase !== 'ready' || announced === status.version || !Notification.isSupported())
      return
    announced = status.version ?? ''
    const note = new Notification({
      title: 'Atualização pronta',
      body: `Clique para reiniciar o Horizonte na versão ${(status.version ?? '').replace(/-beta\./, ' beta ')}.`
    })
    note.on('click', () => void updates.perform('install'))
    note.show()
  })
  // Além de ao abrir, confere de tempos em tempos: o app costuma ficar aberto na bandeja por dias.
  setInterval(
    () => {
      if (['idle', 'current', 'error'].includes(updates.status().phase))
        void updates.perform('check')
    },
    4 * 60 * 60 * 1000
  ).unref()
  ipcMain.handle(CHANNELS.updateStatus, () => updates.status())
  const uninstall = createUninstaller({
    packaged: app.isPackaged,
    plan: () =>
      choosePlan(
        {
          platform: process.platform,
          executable: process.execPath,
          appImage: process.env.APPIMAGE,
          dataDir: app.getPath('userData'),
          configDir: app.getPath('appData'),
          exists: existsSync
        },
        {
          launch: (path) =>
            new Promise<void>((resolve, reject) => {
              const child = spawn(path, [], { detached: true, stdio: 'ignore' })
              child.once('error', reject)
              child.once('spawn', () => {
                child.unref()
                resolve()
              })
            }),
          elevate: (command, args) =>
            new Promise<void>((resolve, reject) =>
              execFile(command, args, (error) => {
                // 126/127: a pessoa fechou a janela de senha do sistema.
                const code = (error as { code?: unknown } | null)?.code
                if (!error) resolve()
                else reject(code === 126 || code === 127 ? new UninstallCancelled() : error)
              })
            ),
          trash: (path) => shell.trashItem(path),
          removeAfterQuit: (paths) => {
            const child = spawn('sh', ['-c', 'sleep 2; rm -rf -- "$@"', 'sh', ...paths], {
              detached: true,
              stdio: 'ignore'
            })
            child.unref()
          }
        }
      ),
    busy: () =>
      ['connected', 'receiving', 'preparing', 'approve'].includes(
        controller.getSnapshot().state.screen
      ),
    stop: () => controller.dispatch({ type: 'STOP' }),
    confirm: async (detail) =>
      (
        await dialog.showMessageBox({
          type: 'question',
          title: 'Desinstalar Horizonte',
          message: 'Desinstalar o Horizonte?',
          detail,
          buttons: ['Cancelar', 'Desinstalar'],
          defaultId: 0,
          cancelId: 0
        })
      ).response === 1,
    quit: () => app.quit()
  })
  ipcMain.handle(CHANNELS.uninstall, () => uninstall())
  ipcMain.handle(CHANNELS.update, (_event, action: unknown) => {
    if (action === 'check' || action === 'download' || action === 'install')
      return updates.perform(action)
    return updates.status()
  })
  if (engine === fake && !app.isPackaged) runDevDemo(controller, fake)

  ipcMain.handle(CHANNELS.snapshot, () => controller.getSnapshot())
  ipcMain.handle(CHANNELS.dispatch, (_event, payload: unknown) => {
    if (isUiEvent(payload)) controller.dispatch(payload)
  })
  ipcMain.handle(CHANNELS.updateSettings, (_event, patch: unknown) =>
    controller.updateSettings(
      (typeof patch === 'object' && patch !== null ? patch : {}) as SettingsPatch
    )
  )
  // As listas trazem o tipo de cada aparelho: o que ele anuncia, ou um palpite pelo nome.
  ipcMain.handle(CHANNELS.hosts, async () => {
    const [hosts] = await Promise.all([
      controller.listHosts(),
      presence.refresh().catch(() => undefined)
    ])
    return presence.withKinds(hosts)
  })
  ipcMain.handle(CHANNELS.mousePeers, async () => {
    const [peers] = await Promise.all([
      controller.listMousePeers(),
      presence.refresh().catch(() => undefined)
    ])
    return presence.withKinds(peers)
  })
  ipcMain.handle(CHANNELS.mouseScreen, () => desktopSize(virtualDisplay()))
  ipcMain.handle(CHANNELS.videoHint, () => {
    if (process.platform !== 'linux') return null
    const { screenPlacement, screenPlacements, mouseSides } = controller.getSnapshot().settings
    return readVideoHint([
      screenPlacement.side,
      ...Object.values(screenPlacements).map((p) => p.side),
      ...Object.values(mouseSides)
    ])
  })
  ipcMain.handle(CHANNELS.deviceKind, async (_event, address: unknown, name: unknown) => {
    if (typeof name !== 'string') return kindReady
    const where = typeof address === 'string' ? address : undefined
    if (where) await presence.refresh().catch(() => undefined)
    return presence.kindOf(where, name)
  })
  ipcMain.handle(CHANNELS.openRepo, () => shell.openExternal(REPO_URL))
  const reports = createDiagnosticReporter({
    text: async () =>
      `${buildReportDiagnostic(diagnosticEnv, controller.getSnapshot())}\n\n${await history.summary()}`,
    post: async (texto) =>
      (
        await fetch(DIAGNOSTIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ texto }),
          signal: AbortSignal.timeout(15_000)
        }).catch(() => null)
      )?.ok === true
  })
  ipcMain.handle(CHANNELS.reportDiagnostic, () => reports.send())
  // Só texto curto (o link da página): nada de conteúdo grande vindo da janela.
  ipcMain.handle(CHANNELS.copyText, (_event, text: unknown) => {
    if (typeof text === 'string' && text.length <= 2000) clipboard.writeText(text)
  })
  // Menu Compartilhar do macOS (AirDrop, Mensagens...): só o endereço da página, http na rede local.
  ipcMain.handle(CHANNELS.shareLink, (event, url: unknown) => {
    if (process.platform !== 'darwin' || !isLocalPageUrl(url)) return
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
    new ShareMenu({ urls: [url] }).popup({ window })
  })
  // A página do receptor vem deste app (main/web/browser.ts).
  const webAccess = createBrowserAccess({
    pagesDir: join(__dirname, '../renderer'),
    signalingPort: () => signalingPort(),
    lanAddress: () => lanAddress()
  })
  ipcMain.handle(CHANNELS.webAccess, () => webAccess.status())
  ipcMain.handle(CHANNELS.setWebAccess, (_event, on: unknown) =>
    on === true ? webAccess.start() : webAccess.stop().then(() => webAccess.status())
  )
  app.on('before-quit', () => void webAccess.stop())

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

/**
 * Onde o app consegue se atualizar sozinho: Windows (instalador), AppImage e o pacote .deb (o sistema pede a senha
 * numa janela para instalar a versão nova). No Mac, sem assinatura da Apple, não dá: lá fica o link do GitHub.
 */
function updatesSupported(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform !== 'linux') return false
  if (process.env.APPIMAGE) return true
  try {
    return readFileSync(join(process.resourcesPath, 'package-type'), 'utf8').trim() === 'deb'
  } catch {
    return false
  }
}

/** `--motor-send` ou `--motor-receive=IP`: teste do motor novo, no lugar do app (ver `motor/args.ts`). */
function readMotorArgs(): MotorArgs | null | 'invalid' {
  try {
    return parseMotorArgs(process.argv)
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${MOTOR_USAGE}`)
    return 'invalid'
  }
}
const motor = readMotorArgs()

/** No Linux empacotado, com a trava ligada e sem já ter tentado: pede a abertura limpa. Devolve se pediu. */
function restartWithoutPrivilegeLock(): boolean {
  if (process.platform !== 'linux' || !app.isPackaged || process.env[CLEAN_START_ENV]) return false
  try {
    if (!hasNoNewPrivs(readFileSync('/proc/self/status', 'utf8'))) return false
    const { command, args } = cleanStartCommand(process.execPath, process.argv.slice(1))
    return spawnSync(command, args, { timeout: 5000, stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

/** O motor próprio é o único; HORIZONTE_ENGINE=fake abre o motor de mentira do desenvolvimento (o teste do app aberto usa o roteiro dele). */
const USE_FAKE = process.env['HORIZONTE_ENGINE'] === 'fake'

if (motor === 'invalid') {
  app.exit(2)
} else if (motor) {
  prepareMotorSwitches()
  void runMotorBench(motor)
}
// Aberto com a trava do reinício (ver `clean-start.ts`): reabre limpo antes de qualquer janela.
else if (restartWithoutPrivilegeLock()) {
  app.exit(0)
}
// Só uma cópia do app por vez (o instalador já abre uma): abrir de novo traz a janela existente para a frente.
else if (!app.isPackaged || app.requestSingleInstanceLock()) {
  // Conectado, a janela fica escondida na bandeja: abrir pelo menu do sistema precisa mostrá-la, não só dar foco.
  app.on('second-instance', () => raiseWindow(mainWindow))
  if (!USE_FAKE) prepareMotorSwitches()
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
