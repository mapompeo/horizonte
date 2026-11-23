export const CHAPTERS = 5
const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** A rolagem da seção vai de 0 a 1; cada cena ocupa um quinto. */
export function chapterAt(progress) {
  const p = clamp(progress)
  const x = p * CHAPTERS
  const index = Math.min(CHAPTERS - 1, Math.floor(x))
  return { index, local: clamp(x - index) }
}

const smooth = (t) => t * t * (3 - 2 * t)

/**
 * A janela é uma só, arrastada em linha reta por todos os aparelhos (todos com o centro da tela na mesma altura).
 * Cada aparelho mostra a parte dela que cai dentro da sua tela: devolve o deslocamento horizontal da janela dentro
 * de cada tela. Começa no meio da primeira tela e termina no meio da última.
 * `screens` é a posição (left) e a largura de cada tela, na mesma unidade da largura da janela.
 */
export function windowSpots(local, screens, windowWidth) {
  const first = screens[0]
  const last = screens[screens.length - 1]
  const from = first.left + (first.width - windowWidth) / 2
  const to = last.left + (last.width - windowWidth) / 2
  const x = from + (to - from) * smooth(clamp((local - 0.06) / 0.82))
  return screens.map((screen) => x - screen.left)
}

export function qualityAt(local) {
  const raw = 30 + 20 * clamp((local - 0.15) / 0.65)
  return Math.round(raw / 5) * 5
}
