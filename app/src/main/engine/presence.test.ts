import { describe, expect, it } from 'vitest'
import type { FoundService } from './lan'
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

  it('pronto para enviar: o anúncio leva versão, porta, id e começo da impressão digital', () => {
    const calls: [number, Record<string, string>][] = []
    const presence = createPresence({
      advertise: (_name, _type, port, txt) => {
        calls.push([port, txt])
        return () => undefined
      },
      browse: async () => []
    })
    presence.announce('Desktop', 'desktop')
    presence.setSending({ port: 47911, id: 'abc-123', fp: 'AB:CD:'.repeat(16).slice(0, -1) })
    presence.setSending(null)
    expect(calls).toEqual([
      [47900, { k: 'desktop' }],
      [
        47911,
        { k: 'desktop', v: '1', m: 'send', p: '47911', id: 'abc-123', fp: 'ABCDABCDABCDABCD' }
      ],
      [47900, { k: 'desktop' }]
    ])
  })

  it('lista só quem está pronto para enviar na mesma versão, com a porta', async () => {
    const presence = createPresence({
      advertise: () => () => undefined,
      browse: async (): Promise<FoundService[]> => [
        {
          name: 'Desktop',
          address: '192.168.1.7',
          txt: { k: 'desktop', v: '1', m: 'send', p: '47910' }
        },
        { name: 'Notebook', address: '192.168.1.9', txt: { k: 'laptop' } },
        {
          name: 'Antigo',
          address: '192.168.1.3',
          txt: { k: 'desktop', v: '2', m: 'send', p: '47910' }
        },
        { name: 'Torto', address: '192.168.1.4', txt: { k: 'desktop', v: '1', m: 'send', p: 'x' } }
      ]
    })
    expect(await presence.senders()).toEqual([
      { name: 'Desktop', address: '192.168.1.7', port: 47910, kind: 'desktop' }
    ])
  })
})
