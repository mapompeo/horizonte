import { L } from '../shared/lang'

export interface StartupDeps {
  createWindow(): void
  syncAutostart?(): Promise<void>
  reportError(error: Error): void
}

export async function finishStartup(deps: StartupDeps): Promise<void> {
  deps.createWindow()
  try {
    await deps.syncAutostart?.()
  } catch (cause) {
    deps.reportError(
      new Error(
        L({
          pt: 'O Horizonte abriu, mas não consegui configurar a abertura junto com o sistema. Confira as permissões da pasta de configuração e tente alterar essa opção em Ajustes.',
          en: 'Horizonte opened, but I could not set it to open at login. Check the permissions of the settings folder and try changing this option in Settings.',
          es: 'Horizonte se abrió, pero no pude configurar que abra con el sistema. Revisa los permisos de la carpeta de configuración e intenta cambiar esta opción en Ajustes.'
        }),
        { cause }
      )
    )
  }
}

export async function runStartup(
  boot: () => Promise<void>,
  reportFatal: (error: Error) => void
): Promise<void> {
  try {
    await boot()
  } catch (cause) {
    reportFatal(
      new Error(
        L({
          pt: 'Não consegui iniciar o Horizonte. Confira as permissões das pastas de configuração e tente abrir o aplicativo novamente. Se o problema continuar, envie o detalhe abaixo ao suporte.',
          en: 'I could not start Horizonte. Check the permissions of the settings folders and try opening the app again. If the problem continues, send the detail below to support.',
          es: 'No pude iniciar Horizonte. Revisa los permisos de las carpetas de configuración e intenta abrir la app de nuevo. Si el problema continúa, envía el detalle de abajo a soporte.'
        }),
        { cause }
      )
    )
  }
}
