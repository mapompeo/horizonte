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

describe('posição livre no mapa (encaixe)', () => {
  const own = { x: 0, y: 0, w: 1920, h: 1080 }
  const monitor = { w: 2560, h: 1440 }
  const notebook = { w: 1440, h: 900 }

  it('a mesa do dono: monitor à direita e um pouco acima, notebook embaixo do monitor', async () => {
    const { snapRect } = await import('./placement')
    const placed = snapRect({ x: 1950, y: -300, ...monitor }, [own])
    expect(placed).toEqual({ x: 1920, y: -300, ...monitor })
    const below = snapRect({ x: placed.x + 400, y: placed.y + placed.h + 50, ...notebook }, [
      own,
      placed
    ])
    expect(below.y).toBe(placed.y + placed.h)
    expect(below.x).toBe(placed.x + 400)
  })

  it('nunca fica por cima de outra tela: solta em cima, vai para a borda livre mais perto', async () => {
    const { snapRect } = await import('./placement')
    const placed = snapRect({ x: 200, y: 100, ...notebook }, [own])
    const inside =
      placed.x < own.x + own.w &&
      own.x < placed.x + placed.w &&
      placed.y < own.y + own.h &&
      own.y < placed.y + placed.h
    expect(inside).toBe(false)
  })

  it('com outra tela já no lugar mais perto, vai para o próximo lugar livre, sem ficar por cima dela', async () => {
    const { snapRect } = await import('./placement')
    const taken = { x: 1920, y: 0, ...notebook }
    const placed = snapRect({ x: 1925, y: 100, ...notebook }, [own, taken])
    const hits =
      placed.x < taken.x + taken.w &&
      taken.x < placed.x + placed.w &&
      placed.y < taken.y + taken.h &&
      taken.y < placed.y + placed.h
    expect(hits).toBe(false)
  })

  it('sempre fica um pedaço da borda em comum (o sistema recusa tela solta)', async () => {
    const { snapRect } = await import('./placement')
    const placed = snapRect({ x: 1920, y: 5000, ...notebook }, [own])
    const sideBySide = placed.x === own.w && placed.y < own.h && placed.y + placed.h > 0
    const stacked = placed.y === own.h && placed.x < own.w && placed.x + placed.w > 0
    expect(sideBySide || stacked).toBe(true)
  })

  it('o lado aproximado segue a direção do centro', async () => {
    const { sideOf } = await import('./placement')
    expect(sideOf({ x: 1920, y: -300, ...monitor }, own)).toBe('right')
    expect(sideOf({ x: 200, y: 1080, ...notebook }, own)).toBe('below')
    expect(sideOf({ x: -1440, y: 0, ...notebook }, own)).toBe('left')
  })
})
