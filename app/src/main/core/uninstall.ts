import { win32 } from 'node:path'
import type { UninstallResult } from '../../shared/uninstall'

export function createUninstaller(deps: {
  platform: string
  packaged: boolean
  executable: string
  exists(path: string): boolean
  busy(): boolean
  confirm(): Promise<boolean>
  launch(path: string): Promise<void>
  quit(): void
}): () => Promise<UninstallResult> {
  let pending: Promise<UninstallResult> | undefined
  async function run(): Promise<UninstallResult> {
    if (!deps.packaged) return 'unavailable'
    if (deps.busy()) return 'busy'
    if (deps.platform !== 'win32') return 'manual'
    const executable = win32.join(win32.dirname(deps.executable), 'Uninstall Horizonte.exe')
    if (!deps.exists(executable)) return 'unavailable'
    try {
      if (!(await deps.confirm())) return 'cancelled'
      if (deps.busy()) return 'busy'
      await deps.launch(executable)
      deps.quit()
      return 'started'
    } catch {
      return 'failed'
    }
  }
  return () => {
    pending ??= run().finally(() => {
      pending = undefined
    })
    return pending
  }
}
