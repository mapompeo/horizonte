import { createController, type Controller } from '../src/main/core/controller'
import { version } from '../package.json'
import { DEFAULT_SETTINGS, type SettingsStore } from '../src/main/core/settings'
import { route } from '../src/renderer/src/lib/store'
import { FakeEngine } from '../src/main/engine/fake'
import { REPO_URL, type HorizonteApi } from '../src/shared/api'
import type { AppState, Settings, Snapshot, WebAccess } from '../src/shared/types'

export interface DemoControl {
  /** Recomeça o app numa tela (ou no modo salvo, se vazio). Usado pela página para dirigir o app. */
  reset(initial?: AppState): Promise<void>
  requestConnection(): void
}

declare global {
  interface Window {
    __demo?: DemoControl
  }
}

/**
 * Liga o app de verdade (o mesmo Svelte, o mesmo núcleo) a um motor de mentira que roda no próprio navegador.
 * Assim a página mostra sempre a interface atual do projeto, sem uma cópia para manter.
 */
export async function installDemo(options: { initial?: AppState; auto: boolean }): Promise<void> {
  let saved: Settings = {
    ...DEFAULT_SETTINGS,
    deviceName: 'Desktop',
    autostart: false,
    mode: 'send'
  }
  const store: SettingsStore = {
    load: async () => saved,
    save: async (next) => {
      saved = next
    }
  }
  const listeners = new Set<(snapshot: Snapshot) => void>()
  let controller: Controller
  let engine: FakeEngine
  let stopWatching = (): void => undefined
  let stopForwarding = (): void => undefined
  let generation = 0
  let web: WebAccess = { on: false }

  /** O "outro aparelho" da demonstração: pede para conectar e, aprovado, conecta. */
  function watch(current: Controller, fake: FakeEngine): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined
    let approvedTimer: ReturnType<typeof setTimeout> | undefined
    const update = ({ state }: Snapshot): void => {
      clearTimeout(timer)
      clearTimeout(approvedTimer)
      if (options.auto && state.screen === 'ready' && !fake.calls.includes('approve')) {
        timer = setTimeout(() => fake.simulatePairRequest('Notebook', 'p1', '4821'), 5000)
      }
      if (state.screen === 'ready' && fake.calls.includes('approve')) {
        clearTimeout(approvedTimer)
        approvedTimer = setTimeout(() => {
          fake.calls = fake.calls.filter((c) => c !== 'approve')
          fake.simulateClientConnected('Notebook')
        }, 900)
      }
    }
    let active = true
    const stop = current.subscribe(() =>
      queueMicrotask(() => {
        if (active) update(current.getSnapshot())
      })
    )
    update(current.getSnapshot())
    return () => {
      active = false
      clearTimeout(timer)
      clearTimeout(approvedTimer)
      stop()
    }
  }

  async function build(initial?: AppState): Promise<void> {
    const run = ++generation
    stopWatching()
    stopForwarding()
    const nextEngine = new FakeEngine(450)
    nextEngine.hosts = [{ name: 'Desktop', address: '192.168.1.5' }]
    const nextController = await createController({ engine: nextEngine, store, initial })
    if (run !== generation) return
    engine = nextEngine
    controller = nextController
    route.set('main')
    stopForwarding = controller.subscribe((snapshot) =>
      listeners.forEach((listener) => listener(snapshot))
    )
    stopWatching = watch(controller, engine)
    listeners.forEach((listener) => listener(controller.getSnapshot()))
  }

  await build(options.initial)

  const api: HorizonteApi = {
    platform: 'win32',
    getUpdateStatus: async () => ({ phase: 'unavailable', currentVersion: version }),
    update: async () => ({ phase: 'unavailable', currentVersion: version }),
    onUpdate: () => () => undefined,
    getSnapshot: async () => controller.getSnapshot(),
    dispatch: async (event) => controller.dispatch(event),
    updateSettings: (patch) => controller.updateSettings(patch),
    listHosts: () => controller.listHosts(),
    getWebAccess: async () => web,
    setWebAccess: async (on) => {
      web = on
        ? { on: true, url: 'http://192.168.1.5:8080', user: 'horizonte', code: '4821' }
        : { on: false }
      return web
    },
    openRepo: async () => void window.open(REPO_URL, '_blank', 'noopener'),
    copyDiagnostic: async () => {
      try {
        await navigator.clipboard.writeText('Horizonte (demonstração): este texto é só um exemplo.')
      } catch {
        return false
      }
      return true
    },
    onSnapshot: (callback) => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    }
  }
  window.horizonte = api
  window.__demo = {
    reset: (initial) => build(initial),
    requestConnection: () => {
      if (controller.getSnapshot().state.screen === 'ready')
        engine.simulatePairRequest('Notebook', 'p1', '4821')
    }
  }
}
