import type { ScreenRequest, VirtualScreen } from '../../engine/webrtc/display'
import type { RunningDisplay } from '../macos/helper'

export interface GnomeDisplayDeps {
  /** Liga o `horizonte-display` (native/linux) neste tamanho; resolve quando ele avisa "READY". */
  startHelper(request: ScreenRequest): Promise<RunningDisplay>
  /** Ids das telas que o Electron enxerga agora. */
  displays(): number[]
  sleep(ms: number): Promise<void>
  /** Quanto esperar o Electron notar a tela nova. */
  appearTimeoutMs?: number
}

/**
 * Monitor virtual do GNOME (Wayland ou Xorg): o Mutter cria a tela e o auxiliar a mantém viva. Ela aparece à direita
 * das outras, como um monitor de verdade.
 */
export function createGnomeDisplay(deps: GnomeDisplayDeps): VirtualScreen {
  let running: { helper: RunningDisplay; request: ScreenRequest; id: number | null } | null = null
  const same = (a: ScreenRequest, b: ScreenRequest): boolean =>
    a.width === b.width && a.height === b.height && a.fps === b.fps

  return {
    async ensure(request) {
      if (running && same(running.request, request)) return running.id
      running?.helper.stop()
      running = null

      const before = new Set(deps.displays())
      const helper = await deps.startHelper(request)
      running = { helper, request, id: null }
      const polls = Math.ceil((deps.appearTimeoutMs ?? 3000) / 100)
      for (let i = 0; i < polls && running?.helper === helper; i++) {
        const added = deps.displays().find((id) => !before.has(id))
        if (added !== undefined) {
          running.id = added
          break
        }
        await deps.sleep(100)
      }
      return running?.helper === helper ? running.id : null
    },
    async release() {
      running?.helper.stop()
      running = null
    }
  }
}
