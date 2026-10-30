import { guessKind, isDeviceKind, type DeviceKind } from '../../shared/device'
import type { Host } from '../../shared/types'
import type { FoundService } from './lan'
import type { WebRtcHost } from './webrtc/engine'
import { PROTOCOL_VERSION } from './webrtc/protocol'

/** Serviço que todo Horizonte aberto anuncia, em qualquer modo: só o tipo de aparelho, para o ícone nos outros. */
export const PRESENCE_TYPE = 'horizonte'
const PRESENCE_PORT = 47900

/** Este aparelho pronto para enviar a tela (motor próprio): vai no anúncio, para quem mostra achar. */
export interface SendingInfo {
  port: number
  id: string
  fp: string
}

export function createPresence(deps: {
  advertise(name: string, type: string, port: number, txt: Record<string, string>): () => void
  browse(type: string): Promise<FoundService[]>
}): {
  announce(name: string, kind: DeviceKind): void
  /**
   * Com dados: o anúncio passa a dizer que este aparelho está pronto para enviar (versão do protocolo, porta da
   * sinalização, id e começo da impressão digital). null: volta ao anúncio simples.
   */
  setSending(info: SendingInfo | null): void
  /** Quem está pronto para enviar, na mesma versão do protocolo (1,5 s de busca). */
  senders(): Promise<WebRtcHost[]>
  stop(): void
  /** Procura de novo quem está anunciando (1,5 s). */
  refresh(): Promise<void>
  /** O tipo que ele anunciou; sem anúncio, o palpite pelo nome. */
  kindOf(address: string | undefined, name: string): DeviceKind
  withKinds(hosts: Host[]): Host[]
} {
  let unannounce: (() => void) | null = null
  let current: { name: string; kind: DeviceKind } | null = null
  let sending: SendingInfo | null = null
  const kinds = new Map<string, DeviceKind>()
  const kindOf = (address: string | undefined, name: string): DeviceKind =>
    (address ? kinds.get(address) : undefined) ?? guessKind(name)
  return {
    announce(name, kind) {
      unannounce?.()
      current = { name, kind }
      unannounce = sending
        ? deps.advertise(name, PRESENCE_TYPE, sending.port, {
            k: kind,
            v: String(PROTOCOL_VERSION),
            m: 'send',
            p: String(sending.port),
            id: sending.id,
            fp: sending.fp.replace(/:/g, '').slice(0, 16)
          })
        : deps.advertise(name, PRESENCE_TYPE, PRESENCE_PORT, { k: kind })
    },
    setSending(info) {
      sending = info
      if (current) this.announce(current.name, current.kind)
    },
    async senders() {
      const found = await deps.browse(PRESENCE_TYPE)
      for (const { address, txt } of found) if (isDeviceKind(txt.k)) kinds.set(address, txt.k)
      return found.flatMap(({ name, address, txt }): WebRtcHost[] => {
        const port = Number(txt.p)
        if (txt.m !== 'send' || txt.v !== String(PROTOCOL_VERSION)) return []
        if (!Number.isInteger(port) || port < 1 || port > 65535) return []
        return [{ name, address, port, kind: kindOf(address, name) }]
      })
    },
    stop() {
      unannounce?.()
      unannounce = null
      current = null
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
