// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { InputEvent } from '../../../shared/input'
import { attachInputCapture, HOLD_ESC_MS } from './input-capture'

// A janela de quem recebe de verdade: um <video> de 200x100 com imagem quadrada (faixas pretas dos lados), o mouse,
// o toque, a roda e o teclado ligados a ele. Confere o que sai para a outra tela.

let sent: InputEvent[]
let frames: FrameRequestCallback[]
let video: HTMLVideoElement
let quit: ReturnType<typeof vi.fn>
let detach: () => void

function pointer(type: string, init: Record<string, unknown>): void {
  video.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 50,
      ...init
    })
  )
}
const key = (type: 'keydown' | 'keyup', code: string, repeat = false): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat, cancelable: true }))
}

beforeEach(() => {
  sent = []
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { value: 100 })
  Object.defineProperty(video, 'videoHeight', { value: 100 })
  video.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, x: 0, y: 0, right: 200, bottom: 100 }) as DOMRect
  document.body.append(video)
  quit = vi.fn()
  detach = attachInputCapture({
    video,
    send: (event) => sent.push(event),
    onQuit: quit,
    onLocalShortcut: (event) => event.ctrlKey && event.shiftKey && event.code === 'KeyD'
  })
})
afterEach(() => {
  detach()
  video.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('clique: move para o ponto e aperta; soltar solta uma vez só', () => {
  pointer('pointerdown', { clientX: 100, clientY: 50 })
  pointer('pointerup', {})
  pointer('pointerup', {})
  expect(sent).toEqual([
    { t: 'move', x: 0.5, y: 0.5 },
    { t: 'button', button: 'left', down: true },
    { t: 'button', button: 'left', down: false }
  ])
})

test('movimento: um por quadro, com a posição mais nova; nas faixas pretas encosta na borda', () => {
  pointer('pointermove', { clientX: 60 })
  pointer('pointermove', { clientX: 10 })
  expect(sent).toEqual([])
  expect(frames).toHaveLength(1)
  frames[0](0)
  expect(sent).toEqual([{ t: 'move', x: 0, y: 0.5 }])
})

test('toque: cada dedo ganha um espaço e o espaço livre é reaproveitado', () => {
  pointer('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 50 })
  pointer('pointerdown', { pointerType: 'touch', pointerId: 8, clientX: 150 })
  pointer('pointermove', { pointerType: 'touch', pointerId: 8, clientX: 100 })
  pointer('pointerup', { pointerType: 'touch', pointerId: 7, clientX: 50 })
  pointer('pointerdown', { pointerType: 'touch', pointerId: 9, clientX: 100 })
  expect(sent.map((e) => (e.t === 'touch' ? `${e.id}:${e.phase}:${e.x}` : e.t))).toEqual([
    '0:down:0',
    '1:down:1',
    '1:move:0.5',
    '0:up:0',
    '0:down:0.5'
  ])
})

test('roda: pedaços pequenos do touchpad juntam até dar um passo', () => {
  const wheel = (deltaY: number): boolean =>
    video.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true }))
  wheel(25)
  expect(sent).toEqual([])
  wheel(25)
  expect(sent).toEqual([{ t: 'wheel', dx: 0, dy: 1 }])
})

test('teclas: aperta e solta uma vez, sem repetição e sem tecla desconhecida', () => {
  key('keydown', 'KeyA')
  key('keydown', 'KeyA', true)
  key('keydown', 'Tecla Inventada')
  key('keyup', 'KeyA')
  key('keyup', 'KeyA')
  expect(sent).toEqual([
    { t: 'key', code: 'KeyA', down: true },
    { t: 'key', code: 'KeyA', down: false }
  ])
})

test('atalho local (Ctrl+Shift+D) não vai para a outra tela', () => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyD', ctrlKey: true, shiftKey: true })
  )
  expect(sent).toEqual([])
})

test('Esc: um toque curto vai para a outra tela; segurado, sai sem mandar nada', () => {
  vi.useFakeTimers()
  key('keydown', 'Escape')
  key('keyup', 'Escape')
  expect(sent).toEqual([
    { t: 'key', code: 'Escape', down: true },
    { t: 'key', code: 'Escape', down: false }
  ])
  sent = []
  key('keydown', 'Escape')
  vi.advanceTimersByTime(HOLD_ESC_MS)
  key('keyup', 'Escape')
  expect(quit).toHaveBeenCalledOnce()
  expect(sent).toEqual([])
})

test('perder o foco solta tudo que estava apertado do outro lado', () => {
  key('keydown', 'ShiftLeft')
  pointer('pointerdown', { button: 2 })
  pointer('pointerdown', { pointerType: 'touch', pointerId: 3 })
  sent = []
  window.dispatchEvent(new Event('blur'))
  expect(sent).toEqual([
    { t: 'key', code: 'ShiftLeft', down: false },
    { t: 'button', button: 'right', down: false },
    { t: 'touch', id: 0, phase: 'up', x: 0, y: 0 }
  ])
})

test('desligar solta o que estava apertado e para de ouvir', () => {
  key('keydown', 'KeyB')
  sent = []
  detach()
  expect(sent).toEqual([{ t: 'key', code: 'KeyB', down: false }])
  key('keydown', 'KeyC')
  pointer('pointerdown', {})
  expect(sent).toHaveLength(1)
  detach = () => undefined
})
