import { expect, test } from 'vitest'
import { matchesTestColor, TEST_COLOR } from './synthetic'

// O quadro de teste dos testes de ponta a ponta: quem mostra confere a cor do bloco, com folga para a compressão.
test('a cor do bloco passa mesmo com a compressão mexendo um pouco', () => {
  expect(matchesTestColor(TEST_COLOR)).toBe(true)
  expect(matchesTestColor({ r: 230, g: 30, b: 150 })).toBe(true)
})

test('outra cor (tela preta, imagem errada) não passa', () => {
  expect(matchesTestColor({ r: 22, g: 22, b: 26 })).toBe(false)
  expect(matchesTestColor({ r: 255, g: 0, b: 60 })).toBe(false)
  expect(matchesTestColor({ r: 255, g: 60, b: 128 }, 48)).toBe(false)
})
