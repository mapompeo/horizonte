import { SIGNALING_PORT, SIGNALING_PORT_LAST } from '../../engine/webrtc/protocol'

/**
 * Com o ufw ligado, o outro aparelho não alcança a sinalização do motor próprio. Libera só essas portas (TCP) e só
 * para as redes privadas, nunca para a internet. O vídeo (UDP) não precisa de regra: as verificações do WebRTC saem
 * dos dois lados, e o firewall com estado deixa a volta entrar.
 */
export const MOTOR_FIREWALL_SCRIPT = [
  'for net in 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12; do',
  `  ufw allow from "$net" to any port ${SIGNALING_PORT}:${SIGNALING_PORT_LAST} proto tcp`,
  'done'
].join('\n')

export interface FirewallDeps {
  /** Conteúdo de /etc/ufw/ufw.conf (legível sem administrador), ou null se não existe. */
  readConfig(): Promise<string | null>
  /** Já liberado antes por este app (para não pedir a senha de novo). */
  marked(): Promise<boolean>
  mark(): Promise<void>
  /** Roda como administrador (pkexec: o sistema pede a senha). */
  runPrivileged(script: string): Promise<void>
}

/** Libera a sinalização no ufw, se ele estiver ligado; pede a senha uma vez só. */
export async function ensureMotorFirewall(deps: FirewallDeps): Promise<'open' | 'opened'> {
  if (await deps.marked()) return 'open'
  const config = await deps.readConfig()
  if (!config || !/^\s*ENABLED\s*=\s*yes\s*$/m.test(config)) return 'open'
  try {
    await deps.runPrivileged(MOTOR_FIREWALL_SCRIPT)
  } catch (cause) {
    throw new Error(
      'O firewall (ufw) está ligado e não foi liberado. Sem isso, o outro aparelho não consegue se conectar.',
      { cause }
    )
  }
  await deps.mark()
  return 'opened'
}
