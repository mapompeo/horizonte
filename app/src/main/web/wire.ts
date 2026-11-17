import { networkInterfaces } from 'node:os'

/** Primeiro endereço de rede local (privado) que não seja de máquina virtual. */
export function lanAddress(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string | undefined {
  const candidates = Object.values(interfaces)
    .flat()
    .flatMap((i) => (i && i.family === 'IPv4' && !i.internal ? [i.address] : []))
    .filter(
      (a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) && !a.startsWith('192.168.56.')
    )
  return candidates[0]
}
