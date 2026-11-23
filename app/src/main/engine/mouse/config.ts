import type { MouseSide, ScreenSize } from '../../../shared/types'
import type { EdgeRanges } from '../native-mouse/types'

export type { MouseSide }

const horizontal = (side: MouseSide): boolean => side === 'above' || side === 'below'

/**
 * Onde as bordas se encostam. `offset` é onde começa a borda do outro computador, em fração da borda deste
 * (0: alinhados no topo ou à esquerda; negativo: o outro começa antes). Sem `offset`, ficam centralizados.
 * Sempre sobra um pedaço encostado, para o mouse ter por onde passar.
 */
export function edgeRanges(
  side: MouseSide,
  own: ScreenSize,
  peer: ScreenSize,
  offset?: number
): EdgeRanges {
  const ownEdge = horizontal(side) ? own.width : own.height
  const peerEdge = horizontal(side) ? peer.width : peer.height
  const centered = (ownEdge - peerEdge) / 2
  const minimum = Math.min(ownEdge, peerEdge) * 0.05
  const start = Math.min(
    Math.max(offset === undefined ? centered : offset * ownEdge, minimum - peerEdge),
    ownEdge - minimum
  )
  const from = Math.max(0, start)
  const to = Math.min(ownEdge, start + peerEdge)
  const pct = (value: number, edge: number): number =>
    Math.min(100, Math.max(0, Math.round((value / edge) * 100)))
  return {
    own: [pct(from, ownEdge), pct(to, ownEdge)],
    peer: [pct(from - start, peerEdge), pct(to - start, peerEdge)]
  }
}
