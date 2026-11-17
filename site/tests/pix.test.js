import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc16, pixPayload } from '../js/pix.js'

test('CRC16 do Pix bate com o valor de referência do CCITT-FALSE', () => {
  assert.equal(crc16('123456789'), '29B1')
})

test('Pix copia e cola estático: chave no campo 26, sem valor, CRC no fim', () => {
  const code = pixPayload('apoio@exemplo.com')
  assert.ok(code.startsWith('000201'))
  assert.ok(code.includes('0014br.gov.bcb.pix0117apoio@exemplo.com'))
  assert.ok(!/54\d{2}\d/.test(code.slice(0, code.indexOf('5802BR'))), 'sem campo de valor')
  assert.ok(code.includes('5303986') && code.includes('5802BR'))
  assert.equal(code.slice(-8, -4), '6304')
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)))
})
