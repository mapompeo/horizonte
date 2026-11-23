import { expect, it } from 'vitest'
import { pickLang, WEB_TEXT } from './strings'

it('idioma do aparelho: português de qualquer lugar, inglês, espanhol; o resto vai para o inglês', () => {
  expect(pickLang(['pt-BR'])).toBe('pt')
  expect(pickLang(['pt-PT', 'en'])).toBe('pt')
  expect(pickLang(['es-MX'])).toBe('es')
  expect(pickLang(['fr-FR', 'es'])).toBe('es')
  expect(pickLang(['de-DE'])).toBe('en')
  expect(pickLang([])).toBe('en')
})

it('os três idiomas têm todos os textos, sem vazio, e o {name} onde precisa', () => {
  const keys = Object.keys(WEB_TEXT.pt).sort()
  for (const lang of ['en', 'es'] as const) {
    expect(Object.keys(WEB_TEXT[lang]).sort()).toEqual(keys)
    for (const value of Object.values(WEB_TEXT[lang])) expect(value.trim()).not.toBe('')
    expect(WEB_TEXT[lang].waiting).toContain('{name}')
  }
})
