/** Cor do bloco fixo do quadro de teste: quem mostra confere que ela chegou. */
export const TEST_COLOR = { r: 255, g: 0, b: 128 }

/**
 * Quadro de teste no lugar da tela, para os testes de ponta a ponta: um bloco de cor fixa no quarto de cima à
 * esquerda e uma faixa que anda na metade de baixo (para o codificador ter o que mandar a cada quadro).
 */
export function syntheticStream(width: number, height: number, fps: number): MediaStream {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  let frame = 0
  // Janela oculta: o requestAnimationFrame não roda, o intervalo sim (backgroundThrottling desligado).
  setInterval(() => {
    frame += 1
    ctx.fillStyle = '#16161a'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = `rgb(${TEST_COLOR.r}, ${TEST_COLOR.g}, ${TEST_COLOR.b})`
    ctx.fillRect(0, 0, width / 2, height / 2)
    ctx.fillStyle = '#f5f5f7'
    const bar = width / 10
    ctx.fillRect(((frame * 8) % (width + bar)) - bar, (height * 3) / 4, bar, height / 8)
    ctx.font = `${Math.round(height / 12)}px sans-serif`
    ctx.fillText(String(frame), width * 0.6, height * 0.3)
  }, 1000 / fps)
  return canvas.captureStream(fps)
}

/** Confere se o pixel lido do vídeo recebido é a cor do bloco, com folga para a compressão. */
export function matchesTestColor(
  pixel: { r: number; g: number; b: number },
  tolerance = 48
): boolean {
  return (
    Math.abs(pixel.r - TEST_COLOR.r) <= tolerance &&
    Math.abs(pixel.g - TEST_COLOR.g) <= tolerance &&
    Math.abs(pixel.b - TEST_COLOR.b) <= tolerance
  )
}
