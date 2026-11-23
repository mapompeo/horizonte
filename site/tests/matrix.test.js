import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matrixPaths } from '../js/matrix.js'

test('nove caminhos para três e três sistemas', () => {
  assert.equal(matrixPaths(100, 500, [50, 150, 250]).length, 9)
})

test('cada caminho sai da borda esquerda e chega na borda direita, na altura certa', () => {
  const paths = matrixPaths(100, 500, [50, 150])
  assert.equal(paths[0], 'M100 50 C 300 50 300 50 500 50')
  assert.equal(paths[1], 'M100 50 C 300 50 300 150 500 150')
  assert.equal(paths[3], 'M100 150 C 300 150 300 150 500 150')
  for (const p of paths) {
    assert.match(p, /^M100 /)
    assert.match(p, / 500 \d+$/)
  }
})
