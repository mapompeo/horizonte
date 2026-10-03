import type { PowerShellRunner } from './probes'

export type SmartAppControlState = 'off' | 'on' | 'evaluation' | 'unknown'

/** `VerifiedAndReputablePolicyState`: 0 desligado, 1 ligado, 2 em avaliação (lido no Windows 11 em 02/10/2026). */
export async function readSmartAppControl(run: PowerShellRunner): Promise<SmartAppControlState> {
  try {
    const raw = (
      await run(
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy' -Name VerifiedAndReputablePolicyState -ErrorAction SilentlyContinue).VerifiedAndReputablePolicyState"
      )
    ).trim()
    return ({ '0': 'off', '1': 'on', '2': 'evaluation' } as const)[raw as '0'] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Explica sem tentar contornar: só quem usa o computador decide mexer nessa proteção. */
export function describeSmartAppControl(state: SmartAppControlState): string | null {
  if (state === 'on' || state === 'evaluation') {
    return 'O Controle Inteligente de Aplicativos do Windows pode bloquear o motor de transmissão. Se isso acontecer, o Windows mostra um aviso e você decide se permite.'
  }
  return null
}
