import { describe, expect, it } from 'vitest'
import { isUiEvent } from './events'

describe('isUiEvent', () => {
  it.each([
    { type: 'INSTALL_DONE' },
    { type: 'CHOOSE', mode: 'send' },
    { type: 'CHOOSE', mode: 'receive' },
    { type: 'APPROVE' },
    { type: 'APPROVE', pin: '0042' },
    { type: 'DENY' },
    { type: 'STOP' },
    { type: 'RETRY' },
    { type: 'CONNECT', host: '192.168.1.3', name: 'Desktop' },
    { type: 'CONNECT', host: 'desktop.local', name: 'Desktop' },
    { type: 'CONNECT', host: 'fe80::1', name: 'Desktop' }
  ])('aceita %o', (event) => {
    expect(isUiEvent(event)).toBe(true)
  })

  it.each([
    { type: 'PAIR_REQUEST', device: 'x', pairingId: 'p1' },
    { type: 'PAIR_CANCELLED', pairingId: 'p1' },
    { type: 'APPROVE', pin: '12' },
    { type: 'APPROVE', pin: '12345' },
    { type: 'APPROVE', pin: 4821 },
    { type: 'APPROVE', pin: 'abcd' },
    { type: 'CLIENT_CONNECTED', device: 'x' },
    { type: 'CLIENT_DISCONNECTED' },
    { type: 'PREP_DONE' },
    { type: 'PREP_STEP', step: 'engine' },
    { type: 'STREAM_ENDED' },
    { type: 'FAIL', error: { message: 'x' } },
    { type: 'CHOOSE' },
    { type: 'CHOOSE', mode: 'qualquer' },
    { type: 'CONNECT' },
    { type: 'CONNECT', host: '' },
    { type: 'CONNECT', host: 5, name: 'x' },
    { type: 'CONNECT', host: 'Desktop' },
    { type: 'CONNECT', name: 'Desktop' },
    { type: 'CONNECT', host: '192.168.1.3', name: 7 },
    { type: 'CONNECT', host: '--flag-perigosa=1 outro', name: 'x' },
    { type: 'CONNECT', host: '192.168.1.3\nx', name: 'x' },
    { type: 'CONNECT', host: 'a'.repeat(300), name: 'x' },
    { type: 'CONNECT', host: '192.168.1.3', name: 'n'.repeat(300) },
    { type: 123 },
    {},
    null,
    undefined,
    'APPROVE',
    42,
    []
  ])('rejeita %o', (event) => {
    expect(isUiEvent(event)).toBe(false)
  })
})
