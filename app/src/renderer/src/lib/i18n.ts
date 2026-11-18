import { pickLang, type WebLang } from '../web/strings'

/**
 * Idioma do app: o do sistema (português, inglês ou espanhol; outro vira inglês). A demonstração do site e os testes
 * fixam o idioma por `__hzLang` (a demonstração segue a página; o teste do app abre com --lang=pt-BR).
 */
export const appLang = (): WebLang => {
  const forced = (globalThis as { __hzLang?: string }).__hzLang
  if (forced) return pickLang([forced])
  return typeof navigator === 'undefined'
    ? 'pt'
    : pickLang(navigator.languages ?? [navigator.language])
}

/** O texto no idioma do app; os três ficam juntos, ao lado de onde são usados (o tipo exige os três). */
export const L = <T>(text: Record<WebLang, T>): T => text[appLang()]
