import type { Host } from '../../shared/types'

/** O que a busca precisa do mDNS; o Bonjour de verdade entra em `index.ts`. */
export interface ServiceFound {
  name: string
  addresses?: string[]
  /** De onde veio o pacote do anúncio: por definição, um endereço que alcançamos. */
  referer?: { address: string }
}

export interface ServiceBrowser {
  on(event: 'up', listener: (service: ServiceFound) => void): unknown
  stop(): void
}

export interface DiscoveryDeps {
  /** Procura serviços `_nvstream._tcp`, o anúncio do Sunshine. */
  find(interfaceAddress?: string): ServiceBrowser
  /** Endereços deste aparelho: ele não aparece na própria lista. */
  ownAddresses(): string[]
  /** Redes deste aparelho, para preferir o endereço anunciado que está na mesma rede. */
  localNetworks?(): { address: string; netmask: string }[]
  /** Quanto tempo esperar as respostas. */
  listenMs?: number
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

function toNumber(ip: string): number {
  return ip.split('.').reduce((total, part) => total * 256 + Number(part), 0)
}

function sameNetwork(a: string, b: string, netmask: string): boolean {
  const mask = toNumber(netmask)
  return (toNumber(a) & mask) === (toNumber(b) & mask)
}

/** Lista os aparelhos da rede que estão prontos para enviar a tela. Só o que respondeu de fato. */
export function createDiscovery(deps: DiscoveryDeps): { listHosts(): Promise<Host[]> } {
  return {
    listHosts: () =>
      new Promise((resolve) => {
        const own = new Set(deps.ownAddresses())
        const networks = deps.localNetworks?.() ?? []
        const found = new Map<string, Host>()
        const interfaces = [...new Set(networks.map((n) => n.address))].filter(
          (address) =>
            IPV4.test(address) && !address.startsWith('127.') && !address.startsWith('169.254.')
        )
        const browsers = (interfaces.length ? interfaces : [undefined]).flatMap((address) => {
          try {
            return [deps.find(address)]
          } catch {
            // Um adaptador pode desaparecer entre a enumeracao e a abertura do socket.
            return []
          }
        })
        for (const browser of browsers)
          browser.on('up', (service) => {
            // O anúncio traz um endereço por interface do outro PC, e alguns (adaptador virtual do WSL)
            // se repetem nos dois lados: escolhe o que está na nossa rede, senão o de onde o pacote veio.
            const candidates = [
              ...(service.addresses ?? []),
              service.referer?.address ?? ''
            ].filter((a) => IPV4.test(a) && !own.has(a))
            const address =
              candidates.find((a) => networks.some((n) => sameNetwork(a, n.address, n.netmask))) ??
              candidates[0]
            if (!address) return
            found.set(address, { name: service.name, address })
          })
        setTimeout(() => {
          for (const browser of browsers) browser.stop()
          resolve([...found.values()].sort((a, b) => a.name.localeCompare(b.name)))
        }, deps.listenMs ?? 1500)
      })
  }
}
