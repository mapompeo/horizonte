import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./main.css', import.meta.url), 'utf8')

/** Primeira regra que bate com o seletor, em texto: basta para guardar o que o macOS exige. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `regra ${selector} existe`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('janela do macOS', () => {
  it('a barra do topo reserva espaço para os botões vermelho, amarelo e verde', () => {
    const left = rule("[data-platform='darwin'] .topbar-left")
    const padding = Number(/padding-left:\s*(\d+)px/.exec(left)?.[1])
    // Os botões ficam a 20 px da borda e ocupam cerca de 52 px: a engrenagem começa depois disso.
    expect(padding).toBeGreaterThanOrEqual(80)
  })

  it('o recuo vale só no macOS', () => {
    expect(rule('.topbar-left')).not.toMatch(/padding-left/)
  })
})
