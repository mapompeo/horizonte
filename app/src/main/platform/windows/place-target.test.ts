import { describe, expect, it } from 'vitest'
import { parseLayout, targetFor } from './place-target'

const layout = {
  w: 1280,
  h: 720,
  others: [{ x: 0, y: 0, w: 1920, h: 1080 }]
}

describe('onde o monitor virtual fica no Windows', () => {
  it('de cada lado, no começo da borda', () => {
    expect(targetFor({ side: 'right' }, layout)).toEqual({ x: 1920, y: 0 })
    expect(targetFor({ side: 'left' }, layout)).toEqual({ x: -1280, y: 0 })
    expect(targetFor({ side: 'above' }, layout)).toEqual({ x: 0, y: -720 })
    expect(targetFor({ side: 'below' }, layout)).toEqual({ x: 0, y: 1080 })
  })

  it('com deslocamento, a uma fração da borda', () => {
    expect(targetFor({ side: 'right', offset: 0.5 }, layout)).toEqual({ x: 1920, y: 540 })
    expect(targetFor({ side: 'below', offset: 0.25 }, layout)).toEqual({ x: 480, y: 1080 })
  })

  it('posição livre: encostada na tela mais perto, sem ficar por cima', () => {
    const near = targetFor({ side: 'right', x: 1.2, y: 0.3 }, layout)
    expect(near.x).toBe(1920)
    const inside = targetFor({ side: 'right', x: 0.5, y: 0.5 }, layout)
    const overlaps = inside.x < 1920 && inside.y < 1080 && inside.x + 1280 > 0 && inside.y + 720 > 0
    expect(overlaps).toBe(false)
  })

  it('com duas telas de verdade, a caixa de todas', () => {
    const two = { ...layout, others: [layout.others[0], { x: 1920, y: 0, w: 1920, h: 1080 }] }
    expect(targetFor({ side: 'right' }, two)).toEqual({ x: 3840, y: 0 })
    expect(targetFor({ side: 'below', offset: 0.5 }, two)).toEqual({ x: 1920, y: 1080 })
  })

  it('lê o JSON do roteiro e recusa o que não é', () => {
    expect(
      parseLayout('{"w":1280,"h":720,"others":[{"x":0,"y":0,"w":1920,"h":1080}]}\r\n')
    ).toEqual(layout)
    // Uma tela só: o PowerShell 5 manda o objeto sem a lista.
    expect(parseLayout('{"w":1280,"h":720,"others":{"x":0,"y":0,"w":1920,"h":1080}}')).toEqual(
      layout
    )
    expect(parseLayout('sem-virtual')).toBeNull()
    expect(parseLayout('{"w":1280,"h":720,"others":[]}')).toBeNull()
    expect(parseLayout('')).toBeNull()
  })
})
