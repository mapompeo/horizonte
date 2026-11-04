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
