import { afterEach, expect, it } from 'vitest'
import { appLang, L } from './i18n'

afterEach(() => ((globalThis as { __hzLang?: string }).__hzLang = 'pt'))

it('o idioma fixado (demonstração, testes) vale mais que o do sistema', () => {
  ;(globalThis as { __hzLang?: string }).__hzLang = 'es'
  expect(appLang()).toBe('es')
  expect(L({ pt: 'Conectar', en: 'Connect', es: 'Conectar ahora' })).toBe('Conectar ahora')
  ;(globalThis as { __hzLang?: string }).__hzLang = 'pt-BR'
  expect(L({ pt: 'Sim', en: 'Yes', es: 'Sí' })).toBe('Sim')
})
