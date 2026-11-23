import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APP_H, APP_W, scaleFor } from '../js/live.js'

test('a janela do app tem o tamanho real do Electron (760 por 580)', () => {
  assert.equal(APP_W, 760)
  assert.equal(APP_H, 580)
})

test('escala: a janela inteira cabe na largura disponível', () => {
  assert.equal(scaleFor(760), 1)
  assert.equal(scaleFor(380), 0.5)
  assert.equal(scaleFor(1520), 2)
})

test('largura zero (ainda sem layout) não zera nem quebra a escala', () => {
  assert.equal(scaleFor(0), 1)
  assert.equal(scaleFor(-5), 1)
})
