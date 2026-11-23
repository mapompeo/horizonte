import { snapRect, type Rect } from '../../../shared/placement'
import type { ScreenPlacement } from '../../../shared/types'

/** O que o roteiro de leitura devolve: o tamanho do monitor virtual e as telas de verdade (pixels do Windows). */
export interface Layout {
  w: number
  h: number
  others: Rect[]
}

/** "sem-virtual" (driver ausente) ou o JSON do `layoutScript`; null quando não deu para ler. */
export function parseLayout(out: string): Layout | null {
  const text = out.trim().split(/\r?\n/).at(-1) ?? ''
  try {
    const raw = JSON.parse(text) as { w?: unknown; h?: unknown; others?: unknown }
    const list = Array.isArray(raw.others) ? raw.others : raw.others ? [raw.others] : []
    const others = list.filter(
      (o): o is Rect =>
        typeof o === 'object' &&
        o !== null &&
        ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((o as Record<string, unknown>)[k]))
    )
    if (!Number.isFinite(raw.w) || !Number.isFinite(raw.h) || others.length === 0) return null
    return { w: raw.w as number, h: raw.h as number, others }
  } catch {
    return null
  }
}

/**
 * Onde o monitor virtual fica, em pixels do Windows: de um lado das telas de verdade, a uma fração da borda
 * (`offset`, sem ele no começo dela) ou solto no mapa (`x` e `y` em frações), encostado na tela mais perto, sem ficar
 * por cima de nenhuma. As mesmas regras do Linux e do Mac.
 */
export function targetFor(placement: ScreenPlacement, layout: Layout): { x: number; y: number } {
  const { w, h, others } = layout
  const left = Math.min(...others.map((o) => o.x))
  const top = Math.min(...others.map((o) => o.y))
  const right = Math.max(...others.map((o) => o.x + o.w))
  const bottom = Math.max(...others.map((o) => o.y + o.h))
  if (placement.x !== undefined && placement.y !== undefined) {
    const want = {
      x: left + placement.x * (right - left),
      y: top + placement.y * (bottom - top),
      w,
      h
    }
    const snapped = snapRect(want, others)
    return { x: Math.round(snapped.x), y: Math.round(snapped.y) }
  }
  const alongX = placement.side === 'above' || placement.side === 'below'
  const at = Math.round((placement.offset ?? 0) * (alongX ? right - left : bottom - top))
  switch (placement.side) {
    case 'left':
      return { x: left - w, y: top + at }
    case 'above':
      return { x: left + at, y: top - h }
    case 'below':
      return { x: left + at, y: bottom }
    default:
      return { x: right, y: top + at }
  }
}
