import { afterEach, expect, test, vi } from 'vitest'
import { safeBonjour } from './lan'

const created: { destroy(): void }[] = []
afterEach(() => {
  for (const bonjour of created.splice(0)) bonjour.destroy()
  vi.restoreAllMocks()
})

// Visto de verdade: com o Wi-Fi trocando, o envio do mDNS falhou com "send ENODEV 224.0.0.251:5353" e a exceção
// derrubou o processo principal (janela "A JavaScript error occurred in the main process").
test('erro de rede do mDNS vai para o registro, sem lançar', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const bonjour = safeBonjour('127.0.0.1')
  created.push(bonjour)
  const server = (
    bonjour as unknown as {
      server: { errorCallback(error: Error): void; mdns: NodeJS.EventEmitter }
    }
  ).server
  const enodev = Object.assign(new Error('send ENODEV 224.0.0.251:5353'), { code: 'ENODEV' })
  expect(() => server.errorCallback(enodev)).not.toThrow()
  expect(() => server.mdns.emit('error', enodev)).not.toThrow()
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('ENODEV'))
})
