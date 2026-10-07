import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { installDemo } from './shim'
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
test('Pronto dispara pedido e permitir conecta', async () => {
  await installDemo({ initial: { screen: 'ready', mode: 'send' }, auto: true })
  await vi.advanceTimersByTimeAsync(5000)
  expect((await window.horizonte.getSnapshot()).state.screen).toBe('approve')
  await window.horizonte.dispatch({ type: 'APPROVE' })
  await vi.advanceTimersByTimeAsync(1000)
  expect((await window.horizonte.getSnapshot()).state.screen).toBe('connected')
})
test('falha de clipboard nao afirma sucesso', async () => {
  await installDemo({ auto: false })
  expect(await window.horizonte.copyDiagnostic()).toBe(false)
})
test('trocar para Mostrar cancela pedido automatico', async () => {
  await installDemo({ initial: { screen: 'ready', mode: 'send' }, auto: true })
  await window.horizonte.dispatch({ type: 'CHOOSE', mode: 'receive' })
  await vi.advanceTimersByTimeAsync(6000)
  expect((await window.horizonte.getSnapshot()).state.screen).toBe('discover')
})

test('pedido manual permite conectar sem interromper a demo automaticamente', async () => {
  await installDemo({ initial: { screen: 'ready', mode: 'send' }, auto: false })
  await vi.advanceTimersByTimeAsync(6000)
  expect((await window.horizonte.getSnapshot()).state.screen).toBe('ready')
  window.__demo?.requestConnection()
  await window.horizonte.dispatch({ type: 'APPROVE' })
  await vi.advanceTimersByTimeAsync(1000)
  expect((await window.horizonte.getSnapshot()).state.screen).toBe('connected')
})
