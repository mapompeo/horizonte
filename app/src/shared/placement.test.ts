import { describe, expect, it } from 'vitest'
import { freePlacement, placeAll } from './placement'

describe('posição de várias telas', () => {
  it('quem não tem posição vai para a padrão, ou para o primeiro lado livre', () => {
    expect(freePlacement({ side: 'right' }, [])).toEqual({ side: 'right' })
    expect(freePlacement({ side: 'right', offset: 0.2 }, ['right'])).toEqual({ side: 'left' })
    expect(freePlacement({ side: 'left' }, ['left', 'right'])).toEqual({ side: 'above' })
  })

  it('cada tela na ordem em que conectou, respeitando a posição própria', () => {
    const own = { B: { side: 'above' as const } }
    expect(placeAll(['A', 'B', 'C'], own, { side: 'right' })).toEqual([
      { side: 'right' },
      { side: 'above' },
      { side: 'left' }
    ])
  })
})
