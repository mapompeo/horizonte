import { describe, expect, it } from 'vitest'
import { edgeRanges } from './config'

describe('edgeRanges', () => {
  const desktop = { width: 3840, height: 1080 }
  const notebook = { width: 1366, height: 768 }

  it('sem posição salva, centraliza a tela menor na borda da maior', () => {
    // 768 de 1080 centralizado: começa em 156 (14%) e vai até 924 (86%).
    expect(edgeRanges('left', desktop, notebook)).toEqual({ own: [14, 86], peer: [0, 100] })
  })

  it('o outro mais abaixo, passando da borda: só o pedaço encostado conta dos dois lados', () => {
    // Começa em 70% de 1080 (756) e teria 768: encosta de 756 a 1080, que é 42% do outro.
    expect(edgeRanges('right', desktop, notebook, 0.7)).toEqual({ own: [70, 100], peer: [0, 42] })
  })

  it('o outro mais acima, começando antes da borda', () => {
    expect(edgeRanges('left', desktop, notebook, -0.2)).toEqual({ own: [0, 51], peer: [28, 100] })
  })

  it('arrastado para longe, ainda sobra um pedaço encostado para o mouse passar', () => {
    const { own } = edgeRanges('left', desktop, notebook, 5)
    expect(own[1] - own[0]).toBeGreaterThan(0)
  })

  it('acima usa as larguras', () => {
    expect(edgeRanges('above', notebook, desktop, 0)).toEqual({ own: [0, 100], peer: [0, 36] })
  })
})
