import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Duas camadas de escape: valor do desktop entry e argumento de Exec, sem shell. */
export function desktopEntry(executable: string): string {
  if (/[\r\n\0=]/.test(executable)) throw new Error('Caminho inválido para abrir com o sistema.')
  const quoted = executable
    .replace(/%/g, '%%')
    .replace(/[\\"`$]/g, '\\$&')
    .replace(/\\/g, '\\\\')
  return `[Desktop Entry]\nType=Application\nName=Horizonte\nExec="${quoted}"\nTerminal=false\n`
}

export function createAutostart(deps: {
  platform: string
  executable: string
  configDir: string
  native(on: boolean): void
}): { set(on: boolean): Promise<void> } {
  return {
    async set(on) {
      if (deps.platform === 'linux') {
        const dir = join(deps.configDir, 'autostart')
        const file = join(dir, 'com.horizonte.app.desktop')
        if (on) {
          await mkdir(dir, { recursive: true })
          await writeFile(file, desktopEntry(deps.executable), { encoding: 'utf8', mode: 0o600 })
        } else await rm(file, { force: true })
      } else deps.native(on)
    }
  }
}
