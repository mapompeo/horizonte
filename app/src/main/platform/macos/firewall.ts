import type { FirewallState } from '../windows/firewall'

/** O firewall do macOS (socketfilterfw): lê o estado sem administrador. */
export const SOCKETFILTERFW = '/usr/libexec/ApplicationFirewall/socketfilterfw'

/** A pasta .app de quem está rodando: é ela que o firewall do macOS lista. */
export const appBundle = (executable: string): string =>
  executable.replace(/\/Contents\/MacOS\/[^/]+$/, '')

/**
 * `--getglobalstate` diz se o firewall está ligado ("enabled" / "disabled"); `--getappblocked` diz se este app está
 * liberado ("permitted") ou bloqueado ("blocked"). Desligado conta como liberado: não há o que perguntar.
 */
export function parseMacFirewall(global: string, app: string): FirewallState {
  if (!/enabled/i.test(global) || /State = 0/.test(global)) return 'allowed'
  if (/blocked/i.test(app)) return 'blocked'
  if (/permitted/i.test(app)) return 'allowed'
  return 'unknown'
}
