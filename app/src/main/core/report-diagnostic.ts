/** Recebe o diagnóstico no site do Horizonte (sem conta no GitHub para quem envia). */
export const DIAGNOSTIC_URL = 'https://horizonte-monitor.vercel.app/api/diagnostico'

/**
 * Um clique: manda o relatório completo (já sem dados pessoais) para as Issues do GitHub. Sem conseguir mandar, salva o
 * mesmo texto num arquivo para a pessoa enviar por outro caminho.
 */
export function createDiagnosticReporter(deps: {
  text(): Promise<string>
  post(text: string): Promise<boolean>
  save(text: string): Promise<void>
}): { send(): Promise<'sent' | 'saved'> } {
  return {
    async send() {
      const text = await deps.text()
      if (await deps.post(text)) return 'sent'
      await deps.save(text)
      return 'saved'
    }
  }
}
