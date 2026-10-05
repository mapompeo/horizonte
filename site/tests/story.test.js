import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, chapterAt, qualityAt, windowCross } from '../js/story.js'

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

test('windowCross: parada no começo, atravessada no fim', () => {
  const start = windowCross(0, { a: 400, b: 300 })
  assert.equal(start.aX, 0)
  assert.equal(start.bX, -195)
  assert.equal(start.bCursorVisible, false)
  const end = windowCross(1, { a: 400, b: 300 })
  assert.equal(end.aX, 206)
  assert.equal(end.aCursorVisible, false)
  assert.equal(end.bX, 0)
  assert.equal(end.bTilt, 0)
  assert.equal(end.bCursor, 66)
  assert.equal(end.bCursorVisible, true)
})

test('windowCross anda para frente sem voltar conforme a rolagem desce', () => {
  let last = -Infinity
  for (let p = 0; p <= 1; p += 0.05) {
    const { aX } = windowCross(p, { a: 400, b: 300 })
    assert.ok(aX >= last)
    last = aX
  }
})

test('qualityAt sobe de 30 a 50 em passos de 5', () => {
  assert.equal(qualityAt(0), 30)
  assert.equal(qualityAt(0.15), 30)
  assert.equal(qualityAt(1), 50)
  assert.equal(qualityAt(2), 50)
  for (let p = 0; p <= 1; p += 0.1) assert.equal(qualityAt(p) % 5, 0)
})
