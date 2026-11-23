import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Duas camadas de escape: valor do desktop entry e argumento de Exec, sem shell. */
export function desktopEntry(executable: string): string {
  if (/[\r\n\0=]/.test(executable)) throw new Error('Caminho inválido para abrir com o sistema.')
  const quoted = executable
    .replace(/%/g, '%%')
    .replace(/[\\"`$]/g, '\\$&')
    .replace(/\\/g, '\\\\')
  // Mesmo nome de arquivo e ícone do atalho instalado: o sistema não lista um segundo "Horizonte".
  return `[Desktop Entry]\nType=Application\nName=Horizonte\nExec="${quoted}"\nIcon=horizonte\nTerminal=false\n`
}

/** Igual ao `horizonte.desktop` do pacote, para o sistema tratar os dois como o mesmo app. */
export const AUTOSTART_FILE = 'horizonte.desktop'

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
        const file = join(dir, AUTOSTART_FILE)
        // O nome antigo aparecia como outro app (sem ícone) nos Ajustes do sistema.
        await rm(join(dir, 'com.horizonte.app.desktop'), { force: true })
        if (on) {
          await mkdir(dir, { recursive: true })
          // O GNOME pode deixar aqui um link para o atalho do sistema (do root): gravar por ele dá EACCES.
          await rm(file, { force: true })
          await writeFile(file, desktopEntry(deps.executable), { encoding: 'utf8', mode: 0o600 })
        } else await rm(file, { force: true })
      } else deps.native(on)
    }
  }
}
