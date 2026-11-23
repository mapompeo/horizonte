import { CURSOR, CURSOR_SHAPE, decodePosition, decodeShape } from '../../../shared/cursor'
import { contentRect } from './input-capture'

/**
 * O cursor da tela estendida desenhado por cima do vídeo, quando quem envia manda o cursor à parte. Fica na mesma
 * escala da imagem e não pega o mouse (os cliques passam para o vídeo).
 */
export function attachCursorOverlay(video: HTMLVideoElement): {
  /** Os canais `cursor` e `cursor-shape` que quem envia abre. */
  listen(channel: RTCDataChannel): void
  hide(): void
} {
  const canvas = document.createElement('canvas')
  canvas.className = 'motor-cursor'
  canvas.hidden = true
  document.body.append(canvas)
  const context = canvas.getContext('2d')
  let hot = { x: 0, y: 0 }
  let hasShape = false

  function place(fx: number, fy: number): void {
    if (!video.videoWidth) return
    const box = video.getBoundingClientRect()
    const rect = contentRect(box, { width: video.videoWidth, height: video.videoHeight })
    const scale = rect.width / video.videoWidth
    canvas.style.width = `${canvas.width * scale}px`
    canvas.style.height = `${canvas.height * scale}px`
    const left = box.left + rect.x + fx * rect.width - hot.x * scale
    const top = box.top + rect.y + fy * rect.height - hot.y * scale
    canvas.style.transform = `translate(${left}px, ${top}px)`
  }

  return {
    listen(channel) {
      if (channel.label !== CURSOR && channel.label !== CURSOR_SHAPE) return
      channel.binaryType = 'arraybuffer'
      channel.addEventListener('message', ({ data }) => {
        if (!(data instanceof ArrayBuffer)) return
        if (channel.label === CURSOR_SHAPE) {
          const shape = decodeShape(data)
          if (!shape || !context) return
          canvas.width = shape.width
          canvas.height = shape.height
          const pixels = new Uint8ClampedArray(shape.width * shape.height * 4)
          pixels.set(shape.data)
          context.putImageData(new ImageData(pixels, shape.width, shape.height), 0, 0)
          hot = { x: shape.hotX, y: shape.hotY }
          hasShape = true
          return
        }
        const position = decodePosition(data)
        if (!position) return
        // Fora da tela estendida (o cursor voltou para as outras telas), ele some daqui.
        const inside = position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1
        canvas.hidden = !hasShape || !position.visible || !inside
        if (!canvas.hidden) place(position.x, position.y)
      })
    },
    hide() {
      canvas.hidden = true
      hasShape = false
    }
  }
}
