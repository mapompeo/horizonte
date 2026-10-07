import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, isHostAddress, profileOf, reduce, stepBitrate } from '../js/demo-state.js'

const run = (state, ...actions) => actions.reduce(reduce, state)

test('começa enviando, esperando conexão', () => {
  const s = initialState()
  assert.equal(s.mode, 'send')
  assert.equal(s.screen, 'ready')
  assert.equal(s.bitrate, 30)
})

test('trocar de modo vai para a tela parada do modo e some com o que estava aberto', () => {
  const s = run(initialState(), { type: 'WEB' }, { type: 'MODE', mode: 'receive' })
  assert.equal(s.screen, 'discover')
  assert.equal(s.web, false)
  assert.equal(run(s, { type: 'MODE', mode: 'send' }).screen, 'ready')
})

test('enviar: pedido, permitir, conectado, parar volta a esperar', () => {
  let s = run(initialState(), { type: 'REQUEST' })
  assert.equal(s.screen, 'approve')
  s = run(s, { type: 'APPROVE' })
  assert.equal(s.screen, 'connected')
  assert.equal(run(s, { type: 'STOP' }).screen, 'ready')
})

test('recusar volta a esperar; pedido fora da espera é ignorado', () => {
  assert.equal(run(initialState(), { type: 'REQUEST' }, { type: 'DENY' }).screen, 'ready')
  const receiving = run(initialState(), { type: 'MODE', mode: 'receive' }, { type: 'REQUEST' })
  assert.equal(receiving.screen, 'discover')
})

test('mostrar: estender recebe e sair volta à lista', () => {
  let s = run(initialState(), { type: 'MODE', mode: 'receive' }, { type: 'EXTEND' })
  assert.equal(s.screen, 'receiving')
  s = run(s, { type: 'STOP' })
  assert.equal(s.screen, 'discover')
})

test('ajustes abre por cima e voltar leva à tela de antes, em qualquer modo', () => {
  let s = run(initialState(), { type: 'REQUEST' }, { type: 'APPROVE' }, { type: 'OPEN_SETTINGS' })
  assert.equal(s.screen, 'settings')
  assert.equal(run(s, { type: 'CLOSE_SETTINGS' }).screen, 'connected')
  s = run(initialState(), { type: 'MODE', mode: 'receive' }, { type: 'OPEN_SETTINGS' })
  assert.equal(run(s, { type: 'CLOSE_SETTINGS' }).screen, 'discover')
})

test('abrir ajustes duas vezes não perde a tela de origem', () => {
  const s = run(initialState(), { type: 'OPEN_SETTINGS' }, { type: 'OPEN_SETTINGS' })
  assert.equal(run(s, { type: 'CLOSE_SETTINGS' }).screen, 'ready')
})

test('trocar o modo dentro dos ajustes muda para onde o voltar leva', () => {
  const s = run(initialState(), { type: 'OPEN_SETTINGS' }, { type: 'MODE', mode: 'receive' })
  assert.equal(s.screen, 'settings')
  assert.equal(run(s, { type: 'CLOSE_SETTINGS' }).screen, 'discover')
})

test('qualidade: passos de 5 a 80, sem passar dos limites', () => {
  assert.equal(stepBitrate(30, 1), 40)
  assert.equal(stepBitrate(30, -1), 20)
  assert.equal(stepBitrate(80, 1), 80)
  assert.equal(stepBitrate(5, -1), 5)
  let s = initialState()
  for (let i = 0; i < 20; i++) s = run(s, { type: 'STEP', direction: 1 })
  assert.equal(s.bitrate, 80)
})

test('perfil só existe nos três valores fixos', () => {
  assert.equal(profileOf(10), 'economico')
  assert.equal(profileOf(30), 'equilibrado')
  assert.equal(profileOf(60), 'maximo')
  assert.equal(profileOf(33), null)
})

test('slider e ajustes avançados gravam sem mexer no resto', () => {
  const s = run(initialState(), { type: 'BITRATE', mbps: 200 }, { type: 'SETTING', key: 'fps', value: 120 })
  assert.equal(s.bitrate, 80)
  assert.equal(s.settings.fps, 120)
  assert.equal(s.settings.resolution, '1080p')
})

test('o estado anterior nunca é alterado', () => {
  const before = initialState()
  const snapshot = JSON.stringify(before)
  run(before, { type: 'REQUEST' }, { type: 'APPROVE' }, { type: 'SETTING', key: 'codec', value: 'av1' })
  assert.equal(JSON.stringify(before), snapshot)
})

test('endereço IP à mão: só IPv4 válido', () => {
  assert.equal(isHostAddress('192.168.1.5'), true)
  assert.equal(isHostAddress(' 10.0.0.1 '), true)
  assert.equal(isHostAddress('256.1.1.1'), false)
  assert.equal(isHostAddress('192.168.1'), false)
  assert.equal(isHostAddress('a.b.c.d'), false)
})
