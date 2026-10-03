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
})
