// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CURSOR, CURSOR_SHAPE, encodePosition, encodeShape } from '../../../shared/cursor'
import { attachCursorOverlay } from './cursor-overlay'

// O cursor que quem envia manda à parte, desenhado por cima do vídeo: some sem desenho, fora da tela ou escondido, e
// acompanha a imagem (com as faixas pretas) no lugar certo, pela ponta de clique do desenho.

let video: HTMLVideoElement
let drawn: number
beforeEach(() => {
  drawn = 0
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: () => (drawn += 1)
  } as unknown as CanvasRenderingContext2D)
  video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { value: 100 })
  Object.defineProperty(video, 'videoHeight', { value: 100 })
  // Elemento 200x100 com imagem quadrada: a imagem ocupa de x=50 a x=150.
  video.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect
})
afterEach(() => {
  document.querySelectorAll('.motor-cursor').forEach((c) => c.remove())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function channel(label: string): RTCDataChannel & { deliver(data: ArrayBuffer): void } {
  const target = new EventTarget() as RTCDataChannel & { deliver(data: ArrayBuffer): void }
  Object.assign(target, { label, binaryType: 'blob' })
  target.deliver = (data) => target.dispatchEvent(new MessageEvent('message', { data }))
  return target
}
const shape = encodeShape({ width: 4, height: 4, hotX: 2, hotY: 2, data: new Uint8Array(64) })

test('sem desenho do cursor, a posição não mostra nada', () => {
  const overlay = attachCursorOverlay(video)
  const position = channel(CURSOR)
  overlay.listen(position)
  position.deliver(encodePosition(0.5, 0.5, true))
  expect(document.querySelector<HTMLCanvasElement>('.motor-cursor')?.hidden).toBe(true)
})

test('com desenho: aparece no ponto certo da imagem, pela ponta de clique', () => {
  const overlay = attachCursorOverlay(video)
  const position = channel(CURSOR)
  const look = channel(CURSOR_SHAPE)
  overlay.listen(position)
  overlay.listen(look)
  expect(position.binaryType).toBe('arraybuffer')
  look.deliver(shape)
  expect(drawn).toBe(1)
  position.deliver(encodePosition(0.5, 0.5, true))
  const canvas = document.querySelector<HTMLCanvasElement>('.motor-cursor') as HTMLCanvasElement
  expect(canvas.hidden).toBe(false)
  // Escala 1: centro da imagem em (10+100, 20+50), menos a ponta (2, 2).
  expect(canvas.style.transform).toBe('translate(108px, 68px)')
  expect(canvas.style.width).toBe('4px')
})

test('fora da tela estendida ou escondido, some; hide() esquece o desenho', () => {
  const overlay = attachCursorOverlay(video)
  const position = channel(CURSOR)
  const look = channel(CURSOR_SHAPE)
  overlay.listen(position)
  overlay.listen(look)
  look.deliver(shape)
  const canvas = document.querySelector<HTMLCanvasElement>('.motor-cursor') as HTMLCanvasElement
  position.deliver(encodePosition(1.2, 0.5, true))
  expect(canvas.hidden).toBe(true)
  position.deliver(encodePosition(0.5, 0.5, false))
  expect(canvas.hidden).toBe(true)
  overlay.hide()
  position.deliver(encodePosition(0.5, 0.5, true))
  expect(canvas.hidden).toBe(true)
})

test('canais de outros nomes e mensagens quebradas são ignorados', () => {
  const overlay = attachCursorOverlay(video)
  const other = channel('input')
  overlay.listen(other)
  expect(other.binaryType).toBe('blob')
  const look = channel(CURSOR_SHAPE)
  overlay.listen(look)
  look.deliver(new ArrayBuffer(3))
  expect(drawn).toBe(0)
})
