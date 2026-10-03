import type { Host } from '../../shared/types'

/** O que a busca precisa do mDNS; o Bonjour de verdade entra em `index.ts`. */
export interface ServiceFound {
  name: string
  addresses?: string[]
}

export interface ServiceBrowser {
  on(event: 'up', listener: (service: ServiceFound) => void): unknown
  stop(): void
}

export interface DiscoveryDeps {
  /** Procura serviços `_nvstream._tcp`, o anúncio do Sunshine. */
  find(): ServiceBrowser
  /** Endereços deste aparelho: ele não aparece na própria lista. */
  ownAddresses(): string[]
  /** Quanto tempo esperar as respostas. */
  listenMs?: number
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** Lista os aparelhos da rede que estão prontos para enviar a tela. Só o que respondeu de fato. */
export function createDiscovery(deps: DiscoveryDeps): { listHosts(): Promise<Host[]> } {
  return {
    listHosts: () =>
      new Promise((resolve) => {
        const own = new Set(deps.ownAddresses())
        const found = new Map<string, Host>()
        const browser = deps.find()
        browser.on('up', (service) => {
          const address = service.addresses?.find((a) => IPV4.test(a))
          if (!address || own.has(address)) return
          found.set(address, { name: service.name, address })
        })
        setTimeout(() => {
          browser.stop()
          resolve([...found.values()].sort((a, b) => a.name.localeCompare(b.name)))
        }, deps.listenMs ?? 1500)
      })
  }
}
