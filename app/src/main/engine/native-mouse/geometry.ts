import type { MouseSide, ScreenSize } from '../../../shared/types'
import type { EdgeRanges } from '../deskflow/config'

/** Uma tela deste computador, como o GNOME informa. */
export interface Zone {
  width: number
  height: number
  x: number
  y: number
}

/** Uma barreira do GNOME: o trecho de borda onde o cursor passa para o outro computador. */
export interface Barrier {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Point {
  x: number
  y: number
}

const horizontal = (side: MouseSide): boolean => side === 'above' || side === 'below'

/** A área de trabalho inteira. */
function bounds(zones: Zone[]): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(...zones.map((z) => z.x)),
    top: Math.min(...zones.map((z) => z.y)),
    right: Math.max(...zones.map((z) => z.x + z.width)),
    bottom: Math.max(...zones.map((z) => z.y + z.height))
  }
}

/**
 * A barreira de um computador encostado neste: no lado dele, só nas telas que tocam a borda da área de trabalho, e só
 * no trecho combinado (`ranges`, em porcentagem da borda). Sem trecho em comum, null.
 */
export function barrierFor(side: MouseSide, zones: Zone[], ranges?: EdgeRanges): Barrier | null {
  if (zones.length === 0) return null
  const b = bounds(zones)
  const [fromPct, toPct] = ranges?.own ?? [0, 100]
  if (horizontal(side)) {
    const y = side === 'above' ? b.top : b.bottom
    const touching = zones.filter((z) => (side === 'above' ? z.y === y : z.y + z.height === y))
    const width = b.right - b.left
    const from = Math.max(Math.min(...touching.map((z) => z.x)), b.left + (width * fromPct) / 100)
    const to = Math.min(
      Math.max(...touching.map((z) => z.x + z.width)),
      b.left + (width * toPct) / 100
    )
    if (to <= from) return null
    return { x1: Math.round(from), y1: y, x2: Math.round(to) - 1, y2: y }
  }
  const x = side === 'left' ? b.left : b.right
  const touching = zones.filter((z) => (side === 'left' ? z.x === x : z.x + z.width === x))
  const height = b.bottom - b.top
  const from = Math.max(Math.min(...touching.map((z) => z.y)), b.top + (height * fromPct) / 100)
  const to = Math.min(
    Math.max(...touching.map((z) => z.y + z.height)),
    b.top + (height * toPct) / 100
  )
  if (to <= from) return null
  return { x1: x, y1: Math.round(from), x2: x, y2: Math.round(to) - 1 }
}

/** Onde o cursor aparece no outro computador ao cruzar a borda daqui, em `at`. */
export function entryPoint(
  side: MouseSide,
  barrier: Barrier,
  at: Point,
  peer: ScreenSize,
  ranges?: EdgeRanges
): Point {
  const [from, to] = ranges?.peer ?? [0, 100]
  const along = horizontal(side)
    ? fraction(at.x, barrier.x1, barrier.x2)
    : fraction(at.y, barrier.y1, barrier.y2)
  const edge = horizontal(side) ? peer.width : peer.height
  const position = Math.round((edge * (from + (to - from) * along)) / 100)
  const inside = Math.min(edge - 1, Math.max(0, position))
  if (side === 'right') return { x: 0, y: inside }
  if (side === 'left') return { x: peer.width - 1, y: inside }
  if (side === 'below') return { x: inside, y: 0 }
  return { x: inside, y: peer.height - 1 }
}

/** Onde o cursor volta neste computador ao sair do outro: logo para dentro da barreira, para não cruzar de novo. */
export function returnPoint(
  side: MouseSide,
  barrier: Barrier,
  from: Point,
  peer: ScreenSize,
  ranges?: EdgeRanges
): Point {
  const [start, end] = ranges?.peer ?? [0, 100]
  const edge = horizontal(side) ? peer.width : peer.height
  const pct = ((horizontal(side) ? from.x : from.y) / edge) * 100
  const along = end > start ? Math.min(1, Math.max(0, (pct - start) / (end - start))) : 0
  const INSIDE = 2
  if (horizontal(side))
    return {
      x: barrier.x1 + (barrier.x2 - barrier.x1) * along,
      y: side === 'above' ? barrier.y1 + INSIDE : barrier.y1 - INSIDE
    }
  return {
    x: side === 'left' ? barrier.x1 + INSIDE : barrier.x1 - INSIDE,
    y: barrier.y1 + (barrier.y2 - barrier.y1) * along
  }
}

/** O cursor saiu do outro computador pela borda que encosta neste? */
export function crossedBack(side: MouseSide, position: Point, peer: ScreenSize): boolean {
  if (side === 'right') return position.x < 0
  if (side === 'left') return position.x >= peer.width
  if (side === 'below') return position.y < 0
  return position.y >= peer.height
}

function fraction(value: number, from: number, to: number): number {
  return to > from ? Math.min(1, Math.max(0, (value - from) / (to - from))) : 0
}
