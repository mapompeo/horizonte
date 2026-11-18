import { networkInterfaces } from 'node:os'

/** Placas que não são a rede de casa: máquinas virtuais, contêineres e VPN. O celular não chega nelas. */
const VIRTUAL =
  /docker|^br-|^veth|virbr|vmnet|vbox|virtualbox|vmware|vethernet|hyper-v|wsl|tailscale|zerotier|^zt|^tun|^tap|^utun|^wg|^ppp|loopback/i
/** Placas de verdade: Wi-Fi e cabo, pelo nome que cada sistema usa. */
const REAL = /wi-?fi|wlan|^wl|^en\d|^eth|^enp|^eno|^ens|ethernet|conexão local|local area/i

const isPrivate = (address: string): boolean =>
  /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)

/**
 * O endereço de rede local que o celular alcança, para o QR e o Copiar link. Um computador com Docker, VirtualBox,
 * Hyper-V, WSL ou VPN tem vários endereços privados, e o primeiro da lista muitas vezes é o de uma rede virtual: aí o
 * celular nunca acha o computador. Fora as placas virtuais; entre as que sobram, Wi-Fi e cabo primeiro, e 192.168
 * (a faixa comum dos roteadores de casa) antes das outras.
 */
export function lanAddress(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string | undefined {
  const candidates = Object.entries(interfaces).flatMap(([name, list]) =>
    (list ?? [])
      .filter((i) => i.family === 'IPv4' && !i.internal && isPrivate(i.address))
      .filter((i) => !i.address.startsWith('192.168.56.') && !VIRTUAL.test(name))
      .map((i) => ({
        address: i.address,
        rank: (REAL.test(name) ? 0 : 2) + (i.address.startsWith('192.168.') ? 0 : 1)
      }))
  )
  return candidates.sort((a, b) => a.rank - b.rank)[0]?.address
}
