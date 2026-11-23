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

/**
 * Bonjour numa interface, sem derrubar o app quando a rede some ou muda (Wi-Fi trocando, volta do bloqueio, cabo
 * solto): o envio falha com ENODEV ou ENETUNREACH, e por padrão a biblioteca lança o erro no processo principal. Aqui
 * ele só vai para o registro; o próximo anúncio ou a próxima busca tenta de novo.
 */
export function safeBonjour(interfaceAddress?: string): Bonjour {
  // Opções do multicast-dns por baixo (o tipo do bonjour-service não lista todas).
  const options = { port: 5353, bind: '0.0.0.0', interface: interfaceAddress }
  const report = (error: Error): void =>
    console.warn(`[rede local] ${interfaceAddress ?? 'padrão'}: ${error.message}`)
  const bonjour = new Bonjour(options, report)
  const mdns = (bonjour as unknown as { server?: { mdns?: NodeJS.EventEmitter } }).server?.mdns
  mdns?.on('error', report)
  mdns?.on('warning', report)
  return bonjour
}

const perInterface = (): Bonjour[] => lanInterfaces().map(safeBonjour)

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
