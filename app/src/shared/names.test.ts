import { describe, expect, it } from 'vitest'
import { cleanName } from './names'

describe('cleanName', () => {
  it('mantém nomes normais, aparando os espaços', () => {
    expect(cleanName('  Notebook da Sala ')).toBe('Notebook da Sala')
  })

  it('remove quebras de linha, tabulações e outros controles', () => {
    expect(cleanName('Sala\nchave = valor')).toBe('Salachave = valor')
    expect(cleanName('a\tb\rc')).toBe('abc')
  })

  it('remove caracteres de direção invertida e de largura zero', () => {
    expect(cleanName(`Note${String.fromCharCode(0x202e)}book`)).toBe('Notebook')
    expect(cleanName(`A${String.fromCharCode(0x200b)}b`)).toBe('Ab')
  })

  it('corta por caractere de verdade, sem partir um emoji ao meio', () => {
    const emoji = String.fromCodePoint(0x1f600)
    const result = cleanName(emoji.repeat(50))
    expect(Array.from(result)).toHaveLength(40)
    expect(result).toBe(emoji.repeat(40))
  })

  it('devolve vazio quando não sobra nada', () => {
    expect(cleanName('')).toBe('')
    expect(cleanName(`\n${String.fromCharCode(0x202e)} `)).toBe('')
  })
})
