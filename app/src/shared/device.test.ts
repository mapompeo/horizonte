import { describe, expect, it } from 'vitest'
import { guessKind, kindFromChassis } from './device'

describe('kindFromChassis', () => {
  it('notebook, conversível e destacável viram notebook; tablet é tablet; gabinete é computador', () => {
    expect(kindFromChassis(10)).toBe('laptop')
    expect(kindFromChassis(31)).toBe('laptop')
    expect(kindFromChassis(30)).toBe('tablet')
    expect(kindFromChassis(3)).toBe('desktop')
    expect(kindFromChassis(35)).toBe('desktop')
  })

  it('"outro" e "desconhecido" não decidem', () => {
    expect(kindFromChassis(1)).toBeNull()
    expect(kindFromChassis(2)).toBeNull()
  })
})

describe('guessKind', () => {
  it.each([
    ['iPhone de Ana', 'phone'],
    ['Pixel 9', 'phone'],
    ['Galaxy S24', 'phone'],
    ['iPad Air', 'tablet'],
    ['Galaxy Tab S9', 'tablet'],
    ['SHIELD Android TV', 'tv'],
    ['TV da sala', 'tv'],
    ['MacBook Pro', 'laptop'],
    ['Notebook', 'laptop'],
    ['Desktop', 'desktop'],
    ['Trabalho', 'desktop']
  ] as const)('%s é %s', (name, kind) => {
    expect(guessKind(name)).toBe(kind)
  })
})
