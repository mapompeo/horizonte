import { guessKind, isDeviceKind, type DeviceKind } from '../../shared/device'
import type { Host } from '../../shared/types'
import type { FoundService } from './lan'

/** Serviço que todo Horizonte aberto anuncia, em qualquer modo: só o tipo de aparelho, para o ícone nos outros. */
export const PRESENCE_TYPE = 'horizonte'
const PRESENCE_PORT = 47900

export function createPresence(deps: {
  advertise(name: string, type: string, port: number, txt: Record<string, string>): () => void
  browse(type: string): Promise<FoundService[]>
}): {
  announce(name: string, kind: DeviceKind): void
  stop(): void
  /** Procura de novo quem está anunciando (1,5 s). */
  refresh(): Promise<void>
  /** O tipo que ele anunciou; sem anúncio, o palpite pelo nome. */
  kindOf(address: string | undefined, name: string): DeviceKind
  withKinds(hosts: Host[]): Host[]
} {
  let unannounce: (() => void) | null = null
  const kinds = new Map<string, DeviceKind>()
  const kindOf = (address: string | undefined, name: string): DeviceKind =>
    (address ? kinds.get(address) : undefined) ?? guessKind(name)
  return {
    announce(name, kind) {
      unannounce?.()
      unannounce = deps.advertise(name, PRESENCE_TYPE, PRESENCE_PORT, { k: kind })
    },
    stop() {
      unannounce?.()
      unannounce = null
    },
    async refresh() {
      for (const { address, txt } of await deps.browse(PRESENCE_TYPE))
        if (isDeviceKind(txt.k)) kinds.set(address, txt.k)
    },
    kindOf,
    withKinds: (hosts) =>
      hosts.map((host) => ({ ...host, kind: host.kind ?? kindOf(host.address, host.name) }))
  }
}
