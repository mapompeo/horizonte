import { describe, expect, it } from 'vitest'
import { createPresence } from './presence'

describe('createPresence', () => {
  it('quem anuncia o tipo ganha o ícone certo; quem não anuncia, o palpite pelo nome', async () => {
    const presence = createPresence({
      advertise: () => () => undefined,
      browse: async () => [
        { name: 'Suntrans', address: '192.168.1.7', txt: { k: 'laptop' } },
        { name: 'Estranho', address: '192.168.1.9', txt: { k: 'geladeira' } }
      ]
    })
    await presence.refresh()
    expect(
      presence.withKinds([
        { name: 'Suntrans', address: '192.168.1.7' },
        { name: 'Estranho', address: '192.168.1.9' },
        { name: 'iPhone de Ana', address: '192.168.1.20' }
      ])
    ).toEqual([
      { name: 'Suntrans', address: '192.168.1.7', kind: 'laptop' },
      { name: 'Estranho', address: '192.168.1.9', kind: 'desktop' },
      { name: 'iPhone de Ana', address: '192.168.1.20', kind: 'phone' }
    ])
  })

  it('anunciar de novo troca o anúncio anterior', () => {
    const calls: string[] = []
    const presence = createPresence({
      advertise: (name, _type, _port, txt) => {
        calls.push(`on:${name}:${txt.k}`)
        return () => calls.push(`off:${name}`)
      },
      browse: async () => []
    })
    presence.announce('Desktop', 'desktop')
    presence.announce('Escritório', 'desktop')
    presence.stop()
    expect(calls).toEqual([
      'on:Desktop:desktop',
      'off:Desktop',
      'on:Escritório:desktop',
      'off:Escritório'
    ])
  })
})
