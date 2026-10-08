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
        'O Horizonte abriu, mas não consegui configurar a abertura junto com o sistema. Confira as permissões da pasta de configuração e tente alterar essa opção em Ajustes.',
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
        'Não consegui iniciar o Horizonte. Confira as permissões das pastas de configuração e tente abrir o aplicativo novamente. Se o problema continuar, envie o detalhe abaixo ao suporte.',
        { cause }
      )
    )
  }
}
