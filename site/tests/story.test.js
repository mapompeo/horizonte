import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, chapterAt, qualityAt, windowSpots } from '../js/story.js'

test('cinco cenas', () => assert.equal(CHAPTERS, 5))

test('chapterAt divide a rolagem em cinco partes iguais', () => {
  assert.deepEqual(chapterAt(0), { index: 0, local: 0 })
  assert.deepEqual(chapterAt(0.1), { index: 0, local: 0.5 })
  assert.equal(chapterAt(0.2).index, 1)
  assert.equal(chapterAt(0.65).index, 3)
  assert.equal(chapterAt(0.9).index, 4)
})

test('chapterAt nunca sai do intervalo (fim exato, antes do começo, depois do fim, NaN)', () => {
  assert.deepEqual(chapterAt(1), { index: 4, local: 1 })
  assert.deepEqual(chapterAt(-0.3), { index: 0, local: 0 })
  assert.deepEqual(chapterAt(1.7), { index: 4, local: 1 })
  assert.deepEqual(chapterAt(Number.NaN), { index: 0, local: 0 })
})

const SCREENS = [
  { left: 0, width: 300 },
  { left: 340, width: 220 },
  { left: 600, width: 150 },
  { left: 790, width: 70 }
]

test('windowSpots: começa no meio da primeira tela e termina no meio da última', () => {
  const start = windowSpots(0, SCREENS, 60)
  assert.equal(start[0], 120)
  const end = windowSpots(1, SCREENS, 60)
  assert.equal(end[3], 5)
})

test('windowSpots: um só x global, cada tela vê a janela deslocada pela própria posição', () => {
  const spots = windowSpots(0.5, SCREENS, 60)
  SCREENS.forEach((screen, i) => assert.equal(spots[i] + screen.left, spots[0] + SCREENS[0].left))
})

test('windowSpots anda para frente sem voltar conforme a rolagem desce', () => {
  let last = -Infinity
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const x = windowSpots(p, SCREENS, 60)[0]
    assert.ok(x >= last)
    last = x
  }
})

test('windowSpots aceita rolagem fora de 0 a 1 e NaN sem quebrar', () => {
  assert.deepEqual(windowSpots(-3, SCREENS, 60), windowSpots(0, SCREENS, 60))
  assert.deepEqual(windowSpots(9, SCREENS, 60), windowSpots(1, SCREENS, 60))
  assert.deepEqual(windowSpots(Number.NaN, SCREENS, 60), windowSpots(0, SCREENS, 60))
})

test('qualityAt sobe de 30 a 50 em passos de 5', () => {
  assert.equal(qualityAt(0), 30)
  assert.equal(qualityAt(0.15), 30)
  assert.equal(qualityAt(1), 50)
  assert.equal(qualityAt(2), 50)
  for (let p = 0; p <= 1; p += 0.1) assert.equal(qualityAt(p) % 5, 0)
})

test('animações carregam com as funções atuais da história', async () => {
  const { startScenes } = await import('../js/scenes.js')
  assert.equal(typeof startScenes, 'function')
})
