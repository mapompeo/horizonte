import { networkInterfaces } from 'node:os'
import { Bonjour } from 'bonjour-service'

/** Endereços deste PC, para não listar a si mesmo. */
export const ownAddresses = (): Set<string> =>
  new Set(
    Object.values(networkInterfaces())
      .flat()
      .map((info) => info?.address ?? '')
  )

/** A rota multicast padrão pode ser a do WSL, Docker ou VirtualBox: anuncia e procura em cada interface IPv4. */
const lanInterfaces = (): string[] =>
  Object.values(networkInterfaces())
    .flat()
    .flatMap((info) => (info && info.family === 'IPv4' && !info.internal ? [info.address] : []))

const perInterface = (): Bonjour[] =>
  lanInterfaces().map((address) => {
    // Opções do multicast-dns por baixo (o tipo do bonjour-service não lista todas).
    const options = { port: 5353, bind: '0.0.0.0', interface: address }
    return new Bonjour(options)
  })

export interface FoundService {
  name: string
  address: string
  txt: Record<string, string>
}

/** Procura um serviço na rede local por 1,5 s, sem contar este PC; um resultado por endereço. */
export async function browseService(type: string): Promise<FoundService[]> {
  const own = ownAddresses()
  const found = new Map<string, FoundService>()
  const instances = perInterface()
  const browsers = instances.map((bonjour) =>
    bonjour.find({ type }, (service) => {
      // Primeiro o endereço de onde o anúncio veio de fato; a lista pode trazer Docker ou VPN na frente.
      const address = [service.referer?.address ?? '', ...(service.addresses ?? [])].find(
        (candidate) => /^\d+\.\d+\.\d+\.\d+$/.test(candidate) && !own.has(candidate)
      )
      if (!address) return
      const txt = Object.fromEntries(
        Object.entries((service.txt ?? {}) as Record<string, unknown>).map(([key, value]) => [
          key,
          String(value)
        ])
      )
      found.set(address, { name: service.name, address, txt })
    })
  )
  await new Promise((resolve) => setTimeout(resolve, 1500))
  browsers.forEach((browser) => browser.stop())
  instances.forEach((bonjour) => bonjour.destroy())
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Anuncia este PC em cada interface; devolve como parar. */
export function advertiseService(
  name: string,
  type: string,
  port: number,
  txt?: Record<string, string>
): () => void {
  const instances = perInterface()
  const services = instances.map((bonjour) =>
    // Sem sondagem: os anúncios das outras interfaces deste PC contariam como "nome já em uso".
    bonjour.publish({ name, type, port, probe: false, txt })
  )
  return () => {
    services.forEach((service) => service.stop?.())
    instances.forEach((bonjour) => bonjour.destroy())
  }
}
