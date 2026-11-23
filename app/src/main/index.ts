import {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  desktopCapturer,
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
  systemPreferences,
  Tray
} from 'electron'
import { execFile, spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import {
  cpus,
  freemem,
  homedir,
  hostname,
  release as osRelease,
  tmpdir,
  totalmem,
  userInfo
} from 'node:os'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayTemplate from '../../resources/trayTemplate.png?asset'
import trayTemplate2x from '../../resources/trayTemplate@2x.png?asset'
import { CHANNELS, REPO_URL } from '../shared/api'
import { isUiEvent } from '../shared/events'
import { cleanName } from '../shared/names'
import type {
  AppState,
  MouseSide,
  ScreenSize,
  Settings,
  SettingsPatch,
  Language
} from '../shared/types'
import { createController, type Controller } from './core/controller'
import { createUpdater } from './core/updater'
import { createTrayFollower, wantsAttention } from './core/tray'
import { createUninstaller, UninstallCancelled } from './core/uninstall'
import { choosePlan } from './platform/uninstall-plans'
import { createDiagnosticReporter, DIAGNOSTIC_URL } from './core/report-diagnostic'
import { createDiagnosticHistory } from './core/diagnostic-history'
import { createSettingsStore } from './core/settings'
import { createAutostart } from './platform/autostart'
import { cleanStartCommand, hasNoNewPrivs, takeCleanStartMark } from './platform/linux/clean-start'
import { dockEdgeHint } from './platform/linux/dock-edge'
import { parsePowerSave, wifiPowerHint } from './platform/linux/wifi-power'
import { finishStartup, runStartup } from './startup'
import { runDevDemo } from './dev-demo'
import { MOTOR_USAGE, parseMotorArgs, type MotorArgs } from './motor/args'
import { prepareMotorSwitches, runMotorBench } from './motor/bench'
import { createAppWebRtcEngine, firewallWasRefused, linuxFirewall } from './engine/webrtc/wire'
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
import { createElevation, runWithUac } from './platform/windows/elevation'
import {
  firewallAllowScript,
  firewallStateScript,
  parseFirewallState,
  type FirewallState
} from './platform/windows/firewall'
import { appBundle, parseMacFirewall, SOCKETFILTERFW } from './platform/macos/firewall'
import { lanAddress } from './web/wire'
import { createBrowserAccess, isLocalPageUrl } from './web/browser'
import { showShortcut } from '../shared/shortcut'
import { L } from '../shared/lang'
import { killChildren } from './core/children'
import { buildReportFile, reportFileName } from './core/report-file'
import { errorDialogText, errorHelpUrl, errorTitle, isErrorCode } from '../shared/errors'

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
/** Abre a janela de novo (abriram o Horizonte outra vez e ela não existe mais). */
let reopenWindow: (() => void) | null = null

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
  window.once('ready-to-show', () => {
    window.show()
    // Mac, primeira vez: a pergunta da Gravação de Tela vem logo, com o aviso já na tela, e não no meio da primeira
    // conexão (depois de permitir, o macOS manda reabrir o app, e a conexão se perderia).
    if (
      process.platform === 'darwin' &&
      !USE_FAKE &&
      systemPreferences.getMediaAccessStatus('screen') === 'not-determined'
    )
      setTimeout(
        () =>
          void desktopCapturer
            .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
            .catch(() => undefined),
        1500
      )
  })
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
        tray.setToolTip(
          L({ pt: 'Horizonte: conectado', en: 'Horizonte: connected', es: 'Horizonte: conectado' })
        )
        tray.setContextMenu(
          Menu.buildFromTemplate([
            {
              label: L({ pt: 'Abrir Horizonte', en: 'Open Horizonte', es: 'Abrir Horizonte' }),
              click: showWindow
            },
            { label: L({ pt: 'Sair', en: 'Quit', es: 'Salir' }), click: () => app.quit() }
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
  applyLanguage(controller.getSnapshot().settings.language)
  let lastScreen: AppState['screen'] | null = controller.getSnapshot().state.screen
  const unsubscribe = controller.subscribe((snapshot) => {
    if (nativeTheme.themeSource !== snapshot.settings.theme)
      nativeTheme.themeSource = snapshot.settings.theme
    applyLanguage(snapshot.settings.language)
    if (window.isDestroyed()) return
    window.webContents.send(CHANNELS.push, snapshot)
    followTray(snapshot.state)
    if (wantsAttention(lastScreen, snapshot.state)) showWindow()
    lastScreen = snapshot.state.screen
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    unsubscribe()
    tray?.destroy()
    tray = null
    // Fechar a janela fecha o app. Sem isto, a janela escondida da transmissão segurava o processo vivo, sem janela
    // nenhuma (no Windows, "instâncias travadas" que nem abriam de novo).
    if (process.platform !== 'darwin') app.quit()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Uma linha com data num arquivo de log da pasta do app, que recomeça vazio passando de 512 KiB. */
function appendLog(file: string, level: string, parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${level} ${parts.map((p) => (p instanceof Error ? p.message : String(p))).join(' ')}\n`
  try {
    if (existsSync(file) && statSync(file).size > 512 * 1024) writeFileSync(file, '')
    appendFileSync(file, line)
  } catch {
    // Sem como gravar: segue sem o arquivo.
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
          message: L({
            pt: 'O firewall (ufw) está bloqueando os aparelhos. Toque em Liberar: o sistema pede a sua senha.',
            en: 'The firewall (ufw) is blocking the devices. Click Allow: the system asks for your password.',
            es: 'El firewall (ufw) está bloqueando los dispositivos. Toca Permitir: el sistema pide tu contraseña.'
          }),
          command: null,
          action: 'allow-firewall' as const
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

/** O idioma escolhido nos Ajustes (ou o do sistema) para os textos do processo principal. */
function applyLanguage(language: Language): void {
  ;(globalThis as { __hzLang?: string }).__hzLang =
    language === 'system' ? app.getLocale() : language
}

/**
 * Tudo o que o app registra (console do processo principal e das janelas do motor) também vai para app.log, na
 * pasta do app: é o que o relatório dos Ajustes junta para quem ajuda a descobrir o problema.
 */
function captureConsole(file: string): void {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...parts: unknown[]) => {
      original(...parts)
      appendLog(file, level, parts)
    }
  }
}

async function boot(): Promise<void> {
  await app.whenReady()
  captureConsole(join(app.getPath('userData'), 'app.log'))
  // O idioma dos textos do processo principal (diálogos, avisos, erros): o do sistema, ou o do --lang dos testes. O
  // escolhido nos Ajustes vale assim que os ajustes carregam (`applyLanguage`).
  ;(globalThis as { __hzLang?: string }).__hzLang = app.getLocale()
  electronApp.setAppUserModelId('com.horizonte.app')
  // O app não usa câmera, microfone, localização nem nada parecido: nega qualquer pedido.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))
  // De qualquer lugar, traz a janela (ocupado por outro programa, o registro só falha e o resto segue).
  // No Wayland o registro falha calado (o sistema não deixa sem perguntar): aí os Ajustes não mostram o atalho.
  const shortcutOn = globalShortcut.register(showShortcut(process.platform).accelerator, () =>
    raiseWindow(mainWindow)
  )
  ipcMain.handle(CHANNELS.shortcut, () =>
    shortcutOn ? showShortcut(process.platform).label : null
  )
  app.on('will-quit', () => globalShortcut.unregisterAll())

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
  // O que o atualizador faz fica num arquivo (updater.log, na pasta do app): quando a atualização falha, o motivo
  // está lá, e o código na tela (501, 502 ou 503) já diz o passo.
  const updaterLog = join(app.getPath('userData'), 'updater.log')
  const writeLog = (level: string, parts: unknown[]): void => appendLog(updaterLog, level, parts)
  autoUpdater.logger = {
    info: (...parts: unknown[]) => writeLog('info', parts),
    warn: (...parts: unknown[]) => writeLog('aviso', parts),
    error: (...parts: unknown[]) => writeLog('erro', parts),
    debug: () => undefined
  }
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
    log: (line) => writeLog('falha', [line]),
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
      title: L({ pt: 'Atualização pronta', en: 'Update ready', es: 'Actualización lista' }),
      body: `${L({ pt: 'Clique para reiniciar o Horizonte na versão', en: 'Click to restart Horizonte on version', es: 'Haz clic para reiniciar Horizonte en la versión' })} ${(status.version ?? '').replace(/-beta\./, ' beta ')}.`
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
          title: L({
            pt: 'Desinstalar Horizonte',
            en: 'Uninstall Horizonte',
            es: 'Desinstalar Horizonte'
          }),
          message: L({
            pt: 'Desinstalar o Horizonte?',
            en: 'Uninstall Horizonte?',
            es: '¿Desinstalar Horizonte?'
          }),
          detail,
          buttons: [
            L({ pt: 'Cancelar', en: 'Cancel', es: 'Cancelar' }),
            L({ pt: 'Desinstalar', en: 'Uninstall', es: 'Desinstalar' })
          ],
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
  // Só um código do catálogo vira endereço: a janela não escolhe o site que abre.
  ipcMain.handle(CHANNELS.openErrorHelp, (_event, code: unknown) =>
    isErrorCode(code) ? shell.openExternal(errorHelpUrl(code)) : undefined
  )
  // Um botão só: manda o relatório para as Issues do GitHub; sem internet (ou o site fora), salva o mesmo arquivo na
  // Área de Trabalho e mostra ele, para a pessoa mandar por outro caminho.
  const reports = createDiagnosticReporter({
    text: () => makeReport(),
    post: async (texto) =>
      (
        await fetch(DIAGNOSTIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ texto }),
          signal: AbortSignal.timeout(20_000)
        }).catch(() => null)
      )?.ok === true,
    save: async (texto) => {
      const file = join(app.getPath('desktop'), reportFileName())
      writeFileSync(file, texto)
      shell.showItemInFolder(file)
    }
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
  // Windows: o firewall pergunta na primeira vez; com Cancelar, ele bloqueia e a tela oferece liberar.
  const firewallState = async (): Promise<FirewallState | null> => {
    if (process.platform === 'win32')
      return parseFirewallState(
        await runPowerShell(firewallStateScript(process.execPath), 20_000).catch(() => '')
      )
    if (process.platform !== 'darwin') return null
    const ask = (args: string[]): Promise<string> =>
      new Promise((resolve) =>
        execFile(SOCKETFILTERFW, args, { timeout: 10_000 }, (_error, out) => resolve(String(out)))
      )
    return parseMacFirewall(
      await ask(['--getglobalstate']),
      await ask(['--getappblocked', appBundle(process.execPath)])
    )
  }
  ipcMain.handle(CHANNELS.firewall, firewallState)
  ipcMain.handle(CHANNELS.allowFirewall, async () => {
    // Linux: o botão do aviso de baixo pede a senha do sistema (pkexec) e libera o ufw na hora.
    if (process.platform === 'linux') {
      await linuxFirewall({ asked: true }).catch(() => undefined)
      return null
    }
    if (process.platform !== 'win32') return null
    await createElevation({ run: runWithUac, tmpDir: tmpdir() })
      .runElevated([
        {
          description: 'Liberar o Horizonte no firewall',
          script: firewallAllowScript(process.execPath)
        }
      ])
      .catch(() => undefined) // recusou o pedido de administrador: o estado de agora diz o resto
    return firewallState()
  })
  // Mac: Gravação de Tela (sem ela, o aparelho recebe a tela preta) e Acessibilidade (o toque e o teclado do aparelho).
  ipcMain.handle(CHANNELS.macAccess, () =>
    process.platform === 'darwin'
      ? {
          screen: systemPreferences.getMediaAccessStatus('screen'),
          accessibility: systemPreferences.isTrustedAccessibilityClient(false)
        }
      : null
  )
  // Mac: os Ajustes do Sistema direto na permissão (o Firewall fica em Rede desde o macOS 13).
  const PRIVACY: Record<string, string> = {
    screen: 'com.apple.preference.security?Privacy_ScreenCapture',
    accessibility: 'com.apple.preference.security?Privacy_Accessibility',
    firewall: 'com.apple.Network-Settings.extension'
  }
  ipcMain.handle(CHANNELS.openPrivacy, (_event, kind: unknown) => {
    if (process.platform !== 'darwin' || typeof kind !== 'string' || !(kind in PRIVACY)) return
    void shell.openExternal(`x-apple.systempreferences:${PRIVACY[kind]}`)
  })
  // A página do receptor vem deste app (main/web/browser.ts).
  // O caminho das imagens do modo compatível (iPad antigo) fica em navegador.log, na pasta do app.
  const browserLog = join(app.getPath('userData'), 'navegador.log')
  const webAccess = createBrowserAccess({
    pagesDir: join(__dirname, '../renderer'),
    signalingPort: () => signalingPort(),
    lanAddress: () => lanAddress(),
    log: (line) => {
      console.log(`[navegador] ${line}`)
      appendLog(browserLog, 'info', [line])
    }
  })
  /** O relatório completo (computador, placa de vídeo, telas e o final dos logs), sem dados pessoais. */
  const makeReport = async (): Promise<string> => {
    const snapshot = controller.getSnapshot()
    const { state, settings } = snapshot
    const gpu = (await app.getGPUInfo('basic').catch(() => null)) as {
      gpuDevice?: {
        vendorId?: number
        deviceId?: number
        vendorString?: string
        deviceString?: string
        driverVersion?: string
        active?: boolean
      }[]
    } | null
    const hex = (n?: number): string =>
      n === undefined ? '?' : `0x${n.toString(16).padStart(4, '0')}`
    const features = app.getGPUFeatureStatus() as unknown as Record<string, string>
    const cards =
      gpu?.gpuDevice
        ?.map(
          (d) =>
            `${d.vendorString || hex(d.vendorId)} ${d.deviceString || hex(d.deviceId)}${d.driverVersion ? ` driver ${d.driverVersion}` : ''}${d.active ? ' (em uso)' : ''}`
        )
        .join(' | ') ?? '?'
    const read = (name: string): string | null => {
      try {
        return readFileSync(join(app.getPath('userData'), name), 'utf8')
      } catch {
        return null
      }
    }
    const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`
    const text = buildReportFile(
      {
        version: app.getVersion(),
        system: `${process.platform} ${process.getSystemVersion()} ${process.arch} (Electron ${process.versions.electron})`,
        memory: `${gb(totalmem())}, ${gb(freemem())} livres`,
        cpu: `${cpus()[0]?.model ?? '?'} (${cpus().length} núcleos)`,
        gpu: `${cards}; codificar vídeo: ${features['video_encode'] ?? '?'}, decodificar: ${features['video_decode'] ?? '?'}, composição: ${features['gpu_compositing'] ?? '?'}`,
        displays: screen
          .getAllDisplays()
          .map(
            (d) =>
              `${d.size.width}x${d.size.height} escala ${d.scaleFactor}${d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''}${d.label ? ` ${d.label}` : ''}`
          ),
        state: `${state.screen}${'mode' in state ? ` (modo ${state.mode})` : ''}${state.screen === 'error' ? `, erro ${state.error.code}` : ''}`,
        settings: `${settings.bitrate} Mbps, ${settings.resolution}, ${settings.fps} fps, ${settings.codec}, codificação ${settings.encoding}`
      },
      [
        { name: 'app.log', text: read('app.log') },
        { name: 'navegador.log', text: read('navegador.log') },
        { name: 'updater.log', text: read('updater.log') }
      ],
      homedir(),
      new Date(),
      [hostname(), userInfo().username]
    )
    return `${text}\n${await history.summary()}`
  }
  ipcMain.handle(CHANNELS.webAccess, () => webAccess.status())
  ipcMain.handle(CHANNELS.setWebAccess, (_event, on: unknown) =>
    on === true ? webAccess.start() : webAccess.stop().then(() => webAccess.status())
  )
  app.on('before-quit', () => void webAccess.stop())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(controller)
  })
  reopenWindow = () => createWindow(controller)
  await finishStartup({
    createWindow: () => createWindow(controller),
    syncAutostart: app.isPackaged
      ? () => autostart.set(controller.getSnapshot().settings.autostart)
      : undefined,
    reportError: (error) => {
      console.error(error)
      // O detalhe técnico fica no log; a pessoa vê o que aconteceu, o que fazer e o código.
      dialog.showErrorBox(errorTitle('106'), errorDialogText('106'))
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

// A marca da abertura limpa vale só para este processo (ver `takeCleanStartMark`).
const cleanStarted = takeCleanStartMark(process.env)

/** No Linux empacotado, com a trava ligada e sem já ter tentado: pede a abertura limpa. Devolve se pediu. */
function restartWithoutPrivilegeLock(): boolean {
  if (process.platform !== 'linux' || !app.isPackaged || cleanStarted) return false
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
  app.on('second-instance', () =>
    mainWindow && !mainWindow.isDestroyed() ? raiseWindow(mainWindow) : reopenWindow?.()
  )
  // Saindo: os auxiliares morrem junto (no Windows eles sobreviveriam ao app). Se algo travar a saída, em 5 s o app
  // sai à força: um processo sem janela segurando a trava impedia o Horizonte de abrir de novo.
  app.on('before-quit', () => setTimeout(() => app.exit(0), 5000).unref())
  app.on('will-quit', killChildren)
  process.on('exit', killChildren)
  if (!USE_FAKE) prepareMotorSwitches()
  void runStartup(boot, (error) => {
    console.error(error)
    try {
      dialog.showErrorBox(errorTitle('107'), errorDialogText('107'))
    } finally {
      app.quit()
    }
  })
} else {
  app.quit()
}
