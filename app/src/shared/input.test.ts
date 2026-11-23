import { describe, expect, it } from 'vitest'
import { encodeInput, EVDEV_KEYS, helperCommand, parseInput, type InputEvent } from './input'

describe('entrada vinda de quem mostra', () => {
  it.each<InputEvent>([
    { t: 'move', x: 0.5, y: 0.25 },
    { t: 'move', x: 0, y: 1 },
    { t: 'button', button: 'left', down: true },
    { t: 'button', button: 'right', down: false },
    { t: 'wheel', dx: 0, dy: -3 },
    { t: 'key', code: 'KeyA', down: true },
    { t: 'key', code: 'Semicolon', down: false },
    { t: 'touch', id: 0, phase: 'down', x: 0.1, y: 0.9 }
  ])('aceita e devolve igual: %j', (event) => {
    expect(parseInput(encodeInput(event))).toEqual(event)
  })

  it.each([
    ['JSON inválido', '{'],
    ['tipo desconhecido', '{"t":"exec","cmd":"rm"}'],
    ['ponteiro fora da tela', '{"t":"move","x":1.5,"y":0}'],
    ['ponteiro negativo', '{"t":"move","x":-0.1,"y":0}'],
    ['número que não é número', '{"t":"move","x":"0.5","y":0}'],
    ['botão inventado', '{"t":"button","button":"turbo","down":true}'],
    ['botão do protótipo do objeto', '{"t":"button","button":"toString","down":true}'],
    ['tecla inventada', '{"t":"key","code":"KeyÇ","down":true}'],
    ['tecla do protótipo do objeto', '{"t":"key","code":"constructor","down":true}'],
    ['rolagem gigante', '{"t":"wheel","dx":0,"dy":500}'],
    ['rolagem parada', '{"t":"wheel","dx":0,"dy":0}'],
    ['rolagem fracionária', '{"t":"wheel","dx":0,"dy":1.5}'],
    ['toque com dedo demais', '{"t":"touch","id":10,"phase":"down","x":0,"y":0}'],
    ['mensagem grande demais', JSON.stringify({ t: 'move', x: 0.5, y: 0.5, pad: 'x'.repeat(300) })]
  ])('recusa %s', (_name, raw) => {
    expect(parseInput(raw)).toBeNull()
  })

  it('vira o comando que o auxiliar entende', () => {
    expect(helperCommand({ t: 'move', x: 0.5, y: 0.25 })).toBe('move 0.50000 0.25000\n')
    expect(helperCommand({ t: 'button', button: 'left', down: true })).toBe('button 272 1\n')
    expect(helperCommand({ t: 'button', button: 'right', down: false })).toBe('button 273 0\n')
    expect(helperCommand({ t: 'wheel', dx: 0, dy: -3 })).toBe('wheel 0 -3\n')
    expect(helperCommand({ t: 'key', code: 'KeyA', down: true })).toBe('key 30 1\n')
    expect(helperCommand({ t: 'touch', id: 1, phase: 'up', x: 1, y: 0 })).toBe(
      'touch up 1 1.00000 0.00000\n'
    )
  })

  it('códigos de tecla do evdev certos nas teclas que importam', () => {
    expect(EVDEV_KEYS).toMatchObject({
      KeyQ: 16,
      KeyP: 25,
      KeyA: 30,
      KeyL: 38,
      KeyZ: 44,
      KeyM: 50,
      F1: 59,
      F10: 68,
      F11: 87,
      Enter: 28,
      Space: 57,
      ControlLeft: 29,
      AltRight: 100,
      ArrowUp: 103,
      Delete: 111,
      MetaLeft: 125,
      IntlBackslash: 86,
      IntlRo: 89
    })
  })
})
