import { kindFromChassis, type DeviceKind } from '../../shared/device'

export interface DeviceKindDeps {
  platform: NodeJS.Platform
  /** Windows: roda PowerShell e devolve a saída. */
  runPowerShell(script: string): Promise<string>
  /** Linux e Mac: lê um arquivo ou roda um comando; null se não der. */
  readText(path: string): Promise<string | null>
  listDir(path: string): Promise<string[]>
  run(command: string, args: string[]): Promise<string | null>
}

/** Windows: os tipos de gabinete e, por último, quantas baterias, numa linha ("3,0"). */
export const WINDOWS_KIND_SCRIPT =
  '"$((Get-CimInstance Win32_SystemEnclosure).ChassisTypes -join \',\'),$(@(Get-CimInstance Win32_Battery).Count)"'

/** Pelo gabinete; sem gabinete conhecido, quem tem bateria é notebook. */
function decide(chassis: number[], hasBattery: boolean): DeviceKind {
  for (const code of chassis) {
    const kind = kindFromChassis(code)
    if (kind) return kind
  }
  return hasBattery ? 'laptop' : 'desktop'
}

/** Que tipo de aparelho é este. Na dúvida, computador de mesa. */
export async function detectDeviceKind(deps: DeviceKindDeps): Promise<DeviceKind> {
  try {
    if (deps.platform === 'win32') {
      const out = (await deps.runPowerShell(WINDOWS_KIND_SCRIPT)).trim()
      const parts = out.split(',').map(Number)
      const batteries = parts.pop() ?? 0
      return decide(parts.filter(Number.isFinite), batteries > 0)
    }
    if (deps.platform === 'linux') {
      const chassis = Number((await deps.readText('/sys/class/dmi/id/chassis_type'))?.trim())
      const supplies = await deps.listDir('/sys/class/power_supply').catch(() => [])
      return decide(
        Number.isFinite(chassis) ? [chassis] : [],
        supplies.some((s) => /^BAT/i.test(s))
      )
    }
    if (deps.platform === 'darwin') {
      const model = (await deps.run('sysctl', ['-n', 'hw.model'])) ?? ''
      return /macbook/i.test(model) ? 'laptop' : 'desktop'
    }
  } catch {
    // Sem como saber: fica o padrão.
  }
  return 'desktop'
}
