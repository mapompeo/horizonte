import type { MouseSide, ScreenPlacement } from './types'

const SIDES: readonly MouseSide[] = ['right', 'left', 'above', 'below']

/**
 * Onde fica a tela de quem ainda não tem posição própria: a padrão ou, se outra tela conectada já está desse lado, o
 * primeiro lado livre (direita, esquerda, acima, abaixo). Assim uma tela não nasce sobre a outra.
 */
export function freePlacement(
  fallback: ScreenPlacement,
  taken: Iterable<MouseSide | undefined>
): ScreenPlacement {
  const used = new Set(taken)
  if (!used.has(fallback.side)) return fallback
  const free = SIDES.find((side) => !used.has(side))
  return free ? { side: free } : fallback
}

/** A posição de cada tela conectada, na ordem em que conectaram (a mesma conta que o motor faz ao criar cada uma). */
export function placeAll(
  fingerprints: (string | undefined)[],
  own: Record<string, ScreenPlacement>,
  fallback: ScreenPlacement
): ScreenPlacement[] {
  const out: ScreenPlacement[] = []
  for (const fp of fingerprints) {
    const placement =
      (fp && own[fp]) ||
      freePlacement(
        fallback,
        out.map((p) => p.side)
      )
    out.push(placement)
  }
  return out
}

/** Um retângulo de tela, em unidades da área de trabalho deste computador. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** As duas telas ocupam algum pedaço do mesmo lugar (encostar na borda não conta). */
export const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

/**
 * Onde a tela solta em `want` fica: encostada na borda mais próxima de alguma das outras (`others`), sem ficar por cima
 * de nenhuma, com pelo menos um pedaço da borda em comum (o sistema recusa tela solta no ar). Sem lugar livre perto,
 * a mais próxima de todas as posições encostadas.
 */
export function snapRect(want: Rect, others: Rect[]): Rect {
  let best: Rect | null = null
  let bestDistance = Infinity
  for (const o of others) {
    // Um mínimo de 10% da borda menor em comum: o mouse sempre tem por onde passar.
    const minX = Math.min(want.w, o.w) * 0.1
    const minY = Math.min(want.h, o.h) * 0.1
    const slideX = Math.min(Math.max(want.x, o.x - want.w + minX), o.x + o.w - minX)
    const slideY = Math.min(Math.max(want.y, o.y - want.h + minY), o.y + o.h - minY)
    const candidates: Rect[] = [
      { ...want, x: o.x - want.w, y: slideY },
      { ...want, x: o.x + o.w, y: slideY },
      { ...want, x: slideX, y: o.y - want.h },
      { ...want, x: slideX, y: o.y + o.h }
    ]
    for (const c of candidates) {
      if (others.some((other) => overlap(c, other))) continue
      const distance = Math.hypot(c.x - want.x, c.y - want.y)
      if (distance < bestDistance) {
        best = c
        bestDistance = distance
      }
    }
  }
  return best ?? { ...want, x: (others[0]?.x ?? 0) + (others[0]?.w ?? 0), y: others[0]?.y ?? 0 }
}

/** De que lado deste computador (`own`) a tela fica, pela direção do centro dela (para quem só sabe posicionar por lado). */
export function sideOf(r: Rect, own: Rect): MouseSide {
  const dx = r.x + r.w / 2 - (own.x + own.w / 2)
  const dy = r.y + r.h / 2 - (own.y + own.h / 2)
  if (Math.abs(dx) / own.w >= Math.abs(dy) / own.h) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'above' : 'below'
}
