export const CHAPTERS = 5
const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** A rolagem da seção vai de 0 a 1; cada cena ocupa um quinto. */
export function chapterAt(progress) {
  const p = clamp(progress)
  const x = p * CHAPTERS
  const index = Math.min(CHAPTERS - 1, Math.floor(x))
  return { index, local: clamp(x - index) }
}

/** A janela sai do computador (a) e entra no notebook (b), presa à rolagem nos dois sentidos. */
export function windowCross(local, widths) {
  const out = clamp((local - 0.08) / 0.55)
  const into = clamp((local - 0.3) / 0.45)
  const off = widths.a * 0.5 + 6
  return {
    aX: off * out,
    aCursor: off * out,
    aCursorVisible: out < 0.98,
    // (into - 1), e não -(1 - into): no fim dá 0, e não -0, que é outro valor numa comparação estrita.
    bX: widths.b * 0.65 * (into - 1),
    bTilt: (into - 1) * 3,
    bCursor: widths.b * 0.22 * into,
    bCursorVisible: into > 0.02
  }
}

export function qualityAt(local) {
  const raw = 30 + 20 * clamp((local - 0.15) / 0.65)
  return Math.round(raw / 5) * 5
}
