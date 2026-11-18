/**
 * Idioma do Horizonte: português, inglês ou espanhol (outro idioma vira inglês; português de qualquer lugar fica em
 * português). Vale para o app, a página do celular e o processo principal.
 */
export type Lang = 'pt' | 'en' | 'es'

export function pickLang(languages: readonly string[]): Lang {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (base === 'pt' || base === 'en' || base === 'es') return base
  }
  return 'en'
}

/**
 * O idioma de agora: o que foi fixado em `__hzLang` (o processo principal grava o do sistema ao abrir; a demonstração
 * do site e os testes fixam o deles) ou, numa página, o do navegador. Sem nada disso, português.
 */
export const currentLang = (): Lang => {
  const forced = (globalThis as { __hzLang?: string }).__hzLang
  if (forced) return pickLang([forced])
  return typeof navigator === 'undefined' || !navigator.language
    ? 'pt'
    : pickLang(navigator.languages ?? [navigator.language])
}

/** O texto no idioma de agora; os três ficam juntos, ao lado de onde são usados (o tipo exige os três). */
export const L = <T>(text: Record<Lang, T>): T => text[currentLang()]
