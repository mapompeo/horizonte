import { posix, win32 } from 'node:path'
import type { UninstallPlan } from '../core/uninstall'
import { AUTOSTART_FILE } from './autostart'
import { L } from '../../shared/lang'

/**
 * Como cada sistema remove o Horizonte, sempre levando junto os ajustes e o início automático:
 * - Windows: o desinstalador que veio com o app (o driver de tela virtual é outro programa e fica);
 * - Linux .deb: `pkexec apt-get remove` (o sistema pede a senha numa janela própria);
 * - Linux AppImage: apaga o próprio arquivo;
 * - Mac: manda o Horizonte.app para o Lixo.
 */
export function choosePlan(
  env: {
    platform: string
    executable: string
    /** O caminho do .AppImage, quando o app roda de um (variável APPIMAGE). */
    appImage?: string
    dataDir: string
    configDir: string
    exists(path: string): boolean
  },
  act: {
    launch(path: string): Promise<void>
    elevate(command: string, args: string[]): Promise<void>
    trash(path: string): Promise<void>
    /** Apaga estes caminhos depois que o app fechar (o app em uso não se apaga sozinho). */
    removeAfterQuit(paths: string[]): void
  }
): UninstallPlan | null {
  const autostart = posix.join(env.configDir, 'autostart', AUTOSTART_FILE)
  const legacyAutostart = posix.join(env.configDir, 'autostart', 'com.horizonte.app.desktop')
  if (env.platform === 'win32') {
    const uninstaller = win32.join(win32.dirname(env.executable), 'Uninstall Horizonte.exe')
    if (!env.exists(uninstaller)) return null
    return {
      detail: L({
        pt: 'O app e os ajustes saem deste computador. O driver de tela virtual é outro programa e fica.',
        en: 'The app and its settings leave this computer. The virtual display driver is a separate program and stays.',
        es: 'La app y sus ajustes salen de esta computadora. El controlador de pantalla virtual es otro programa y se queda.'
      }),
      run: () => act.launch(uninstaller)
    }
  }
  if (env.platform === 'linux' && env.appImage) {
    const file = env.appImage
    return {
      detail: L({
        pt: 'O app, os ajustes e o início automático saem deste computador.',
        en: 'The app, its settings and the open-at-login entry leave this computer.',
        es: 'La app, sus ajustes y el inicio automático salen de esta computadora.'
      }),
      run: async () => act.removeAfterQuit([file, env.dataDir, autostart, legacyAutostart])
    }
  }
  if (env.platform === 'linux' && env.exists('/var/lib/dpkg/info/horizonte.list')) {
    return {
      detail: L({
        pt: 'O sistema pede a sua senha uma vez. O app, os ajustes e o início automático saem deste computador.',
        en: 'The system asks for your password once. The app, its settings and the open-at-login entry leave this computer.',
        es: 'El sistema pide tu contraseña una vez. La app, sus ajustes y el inicio automático salen de esta computadora.'
      }),
      run: async () => {
        await act.elevate('pkexec', ['apt-get', 'remove', '-y', 'horizonte'])
        act.removeAfterQuit([env.dataDir, autostart, legacyAutostart])
      }
    }
  }
  const bundle = /^(.+?\.app)\//.exec(env.executable)?.[1]
  if (env.platform === 'darwin' && bundle) {
    return {
      detail: 'O Horizonte vai para o Lixo, e os ajustes saem deste computador.',
      run: async () => {
        await act.trash(bundle)
        act.removeAfterQuit([env.dataDir])
      }
    }
  }
  return null
}
