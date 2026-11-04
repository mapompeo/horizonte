import type { ScreenPlacement } from '../../../shared/types'
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

/** O pedido que o auxiliar entende: "place <lado> [início]" (sem início: centralizada). */
export function placeCommand(placement: ScreenPlacement): string {
  const start = placement.offset === undefined ? '' : ` ${placement.offset.toFixed(4)}`
  return `place ${placement.side}${start}\n`
}

/**
 * Monitor virtual do GNOME (Wayland ou Xorg): o Mutter cria a tela e o auxiliar a mantém viva. Ela aparece à direita
 * das outras, como um monitor de verdade.
 */
/**
 * Com vários aparelhos, um monitor nasce de cada vez: a tela nova de cada um é descoberta comparando a lista de telas de
 * antes e de depois, e dois nascendo juntos se confundiriam.
 */
let creating: Promise<unknown> = Promise.resolve()

export function createGnomeDisplay(deps: GnomeDisplayDeps): VirtualScreen {
  let running: { helper: RunningDisplay; request: ScreenRequest; id: number | null } | null = null
  const same = (a: ScreenRequest, b: ScreenRequest): boolean =>
    a.width === b.width &&
    a.height === b.height &&
    a.fps === b.fps &&
    (a.scale ?? 1) === (b.scale ?? 1) &&
    Boolean(a.cursor) === Boolean(b.cursor)

  return {
    async ensure(request) {
      if (running && same(running.request, request)) return running.id
      const turn = creating.then(() => create(request))
      creating = turn.catch(() => undefined)
      return turn
    },
    async release() {
      running?.helper.stop()
      running = null
    },
    async place(placement) {
      running?.helper.send?.(placeCommand(placement))
    },
    input(line) {
      running?.helper.send?.(line)
    }
  }

  async function create(request: ScreenRequest): Promise<number | null> {
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
  }
}
