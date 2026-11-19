import { expect, it } from 'vitest'
import { mapScreens } from './map-screens'

it('mapa de posição: só aparelhos com tamanho, com a posição de cada um ou a padrão e a qualidade da conexão', () => {
  const screens = mapScreens(
    [
      { device: 'iPhone', fingerprint: 'AA', peerScreen: { width: 2556, height: 1180 } },
      { device: 'Sem tamanho', fingerprint: 'BB' },
      { device: 'Notebook', fingerprint: 'CC', peerScreen: { width: 1920, height: 1080 } }
    ],
    { CC: { side: 'left' } },
    { side: 'below' },
    { AA: 'good' }
  )
  expect(screens.map((s) => s.name)).toEqual(['iPhone', 'Notebook'])
  expect(screens[0]).toMatchObject({ key: 'AA', screen: { width: 2556 }, quality: 'good' })
  expect(screens[0].placement.side).toBe('below')
  expect(screens[1].placement.side).toBe('left')
})
