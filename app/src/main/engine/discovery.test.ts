import { describe, expect, it } from 'vitest'
import { createDiscovery, type ServiceBrowser, type ServiceFound } from './discovery'

function fakeBrowser(services: ServiceFound[]): {
  browser: ServiceBrowser
  stopped: () => boolean
} {
  let stopped = false
  return {
    stopped: () => stopped,
    browser: {
      on: (_event, listener) => {
        services.forEach((s) => setTimeout(() => listener(s), 0))
      },
      stop: () => {
        stopped = true
      }
    }
  }
}

describe('createDiscovery', () => {
  it('interface removida durante a busca nao impede consultar nem fechar o Wi-Fi', async () => {
    const wifi = fakeBrowser([{ name: 'Desktop', addresses: ['192.168.1.5'] }])
    const discovery = createDiscovery({
      find: (address?: string) => {
        if (address === '192.168.56.1') throw new Error('interface removida')
        return wifi.browser
      },
      ownAddresses: () => [],
      localNetworks: () => [
        { address: '192.168.56.1', netmask: '255.255.255.0' },
        { address: '192.168.1.6', netmask: '255.255.255.0' }
      ],
      listenMs: 20
    })
    expect(await discovery.listHosts()).toEqual([{ name: 'Desktop', address: '192.168.1.5' }])
    expect(wifi.stopped()).toBe(true)
  })
  it('consulta todas as interfaces: VirtualBox primeiro nao esconde o Wi-Fi', async () => {
    const interfaces: (string | undefined)[] = []
    const hosts = await createDiscovery({
      find: (address?: string) => {
        interfaces.push(address)
        return fakeBrowser(
          address === '192.168.1.6' ? [{ name: 'Desktop', addresses: ['192.168.1.5'] }] : []
        ).browser
      },
      ownAddresses: () => ['192.168.56.1', '192.168.1.6'],
      localNetworks: () => [
        { address: '192.168.56.1', netmask: '255.255.255.0' },
        { address: '192.168.1.6', netmask: '255.255.255.0' }
      ],
      listenMs: 20
    }).listHosts()
    expect(hosts).toEqual([{ name: 'Desktop', address: '192.168.1.5' }])
    expect(interfaces).toEqual(['192.168.56.1', '192.168.1.6'])
  })
  it('lista só o que respondeu, com o endereço IPv4, e para a busca', async () => {
    const fake = fakeBrowser([
      { name: 'Desktop', addresses: ['fe80::1', '192.168.1.3'] },
      { name: 'Notebook', addresses: ['192.168.1.9'] }
    ])
    const hosts = await createDiscovery({
      find: () => fake.browser,
      ownAddresses: () => [],
      listenMs: 20
    }).listHosts()

    expect(hosts).toEqual([
      { name: 'Desktop', address: '192.168.1.3' },
      { name: 'Notebook', address: '192.168.1.9' }
    ])
    expect(fake.stopped()).toBe(true)
  })

  it('não lista este próprio aparelho nem anúncio sem IPv4', async () => {
    const fake = fakeBrowser([
      { name: 'Eu', addresses: ['192.168.1.5'] },
      { name: 'SoIPv6', addresses: ['fe80::2'] },
      { name: 'SemEndereco' }
    ])
    const hosts = await createDiscovery({
      find: () => fake.browser,
      ownAddresses: () => ['192.168.1.5'],
      listenMs: 20
    }).listHosts()

    expect(hosts).toEqual([])
  })

  it('rede vazia devolve lista vazia, sem inventar aparelho', async () => {
    const hosts = await createDiscovery({
      find: () => fakeBrowser([]).browser,
      ownAddresses: () => [],
      listenMs: 20
    }).listHosts()
    expect(hosts).toEqual([])
  })

  describe('vários endereços no mesmo anúncio', () => {
    const run = async (
      services: ServiceFound[],
      own: string[],
      localNetworks: { address: string; netmask: string }[] = []
    ): Promise<unknown> =>
      createDiscovery({
        find: () => fakeBrowser(services).browser,
        ownAddresses: () => own,
        localNetworks: () => localNetworks,
        listenMs: 20
      }).listHosts()

    it('endereço virtual repetido nos dois PCs (WSL) não esconde o aparelho', async () => {
      const hosts = await run(
        [{ name: 'Desktop', addresses: ['172.31.0.1', '192.168.1.5'] }],
        ['172.31.0.1', '192.168.1.7']
      )
      expect(hosts).toEqual([{ name: 'Desktop', address: '192.168.1.5' }])
    })

    it('prefere o endereço da mesma sub-rede de uma interface local', async () => {
      const hosts = await run(
        [{ name: 'Desktop', addresses: ['10.9.9.9', '192.168.1.5'] }],
        [],
        [{ address: '192.168.1.7', netmask: '255.255.255.0' }]
      )
      expect(hosts).toEqual([{ name: 'Desktop', address: '192.168.1.5' }])
    })

    it('sem sub-rede em comum, usa o primeiro endereço que não é deste PC', async () => {
      const hosts = await run([{ name: 'Desktop', addresses: ['10.9.9.9', '10.9.9.8'] }], [])
      expect(hosts).toEqual([{ name: 'Desktop', address: '10.9.9.9' }])
    })

    it('usa o endereço de origem do pacote quando os anunciados não servem', async () => {
      const hosts = await run(
        [{ name: 'Desktop', addresses: ['172.31.0.1'], referer: { address: '192.168.1.5' } }],
        ['172.31.0.1']
      )
      expect(hosts).toEqual([{ name: 'Desktop', address: '192.168.1.5' }])
    })

    it('se todos os endereços são deste PC, não lista', async () => {
      const hosts = await run(
        [
          {
            name: 'Eu',
            addresses: ['172.31.0.1', '192.168.1.7'],
            referer: { address: '192.168.1.7' }
          }
        ],
        ['172.31.0.1', '192.168.1.7']
      )
      expect(hosts).toEqual([])
    })
  })
})
