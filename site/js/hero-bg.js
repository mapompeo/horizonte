// Fundo da primeira tela: um campo de caracteres parado (mais forte embaixo) e uma garoa rara de dígitos descendo.
// Some no meio, atrás do título. O campo é desenhado uma vez só; a cada quadro só a garoa se mexe, então é leve.
// Pausa fora da tela; com menos movimento pedido, fica só o campo parado.

const CHARS = ' .·:-=+*'

export function mountHeroBackground(canvas) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const field = document.createElement('canvas')
  const s = { w: 0, h: 0, cell: 12, cols: 0, rows: 0, dpr: 1, drops: [], color: '10,132,255' }

  const readColor = () => {
    // A cor de destaque do tema (--accent), em r,g,b.
    const probe = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const hex = /^#([0-9a-f]{6})$/i.exec(probe)
    if (hex) {
      const n = parseInt(hex[1], 16)
      s.color = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    }
  }

  // Quanto o caractere aparece: quase nada atrás do título, cheio nas bordas.
  const veil = (x, y) => {
    const dx = (x - s.w / 2) / (Math.min(s.w, 1100) * 0.34)
    const dy = (y - s.h * 0.42) / (s.h * 0.26)
    return Math.min(1, Math.hypot(dx, dy) * 0.85)
  }

  const font = () => `${s.cell - 1}px ui-monospace, "SF Mono", Menlo, monospace`

  /** O campo parado, desenhado uma vez numa tela fora da página. */
  function paintField() {
    field.width = canvas.width
    field.height = canvas.height
    const f = field.getContext('2d')
    f.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    f.font = font()
    f.textAlign = 'center'
    f.textBaseline = 'middle'
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const x = c * s.cell + s.cell / 2
        const y = r * s.cell + s.cell / 2
        const n = Math.sin(c * 0.16 + 2) + Math.sin(r * 0.25 - 1.4 + c * 0.05) + Math.sin((c + r) * 0.08 + 1)
        const v = ((n + 3) / 6) * (0.25 + 0.75 * (r / s.rows)) * 0.8 * veil(x, y)
        if (v < 0.07) continue
        f.fillStyle = `rgba(${s.color},${(0.12 + v * 0.7).toFixed(3)})`
        f.fillText(CHARS[Math.min(CHARS.length - 1, Math.floor(v * CHARS.length))], x, y)
      }
    }
  }

  const fit = () => {
    const r = canvas.getBoundingClientRect()
    s.dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, r.width * s.dpr)
    canvas.height = Math.max(1, r.height * s.dpr)
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    s.w = r.width
    s.h = r.height
    s.cell = r.width < 600 ? 10 : 12
    s.cols = Math.ceil(s.w / s.cell)
    s.rows = Math.ceil(s.h / s.cell)
    s.drops = Array.from({ length: s.cols }, () => ({
      y: Math.random() * s.rows,
      v: 0.04 + Math.random() * 0.1,
      on: Math.random() < 0.14
    }))
    readColor()
    paintField()
    frame(0)
  }

  function frame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(field, 0, 0)
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    if (reduce) return
    // Garoa de sinal: só as colunas ligadas, poucas letras por quadro.
    ctx.font = font()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let c = 0; c < s.cols; c++) {
      const d = s.drops[c]
      if (!d.on) continue
      const x = c * s.cell + s.cell / 2
      for (let tail = 0; tail <= 6; tail++) {
        const r = Math.floor(d.y) - tail
        if (r < 0 || r >= s.rows) continue
        const y = r * s.cell + s.cell / 2
        const v = (1 - tail / 6) * veil(x, y)
        if (v < 0.07) continue
        ctx.fillStyle = `rgba(${s.color},${(0.12 + v * 0.7).toFixed(3)})`
        ctx.fillText(String.fromCharCode(48 + ((c * 7 + r * 3 + Math.floor(t / 150)) % 10)), x, y)
      }
      d.y += d.v * 2.4
      if (d.y > s.rows + 8) {
        d.y = -Math.random() * 12
        d.on = Math.random() < 0.14
      }
    }
  }

  new ResizeObserver(fit).observe(canvas)
  fit()
  const recolor = () => {
    readColor()
    paintField()
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', recolor)
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  if (reduce) return
  let visible = true
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
  }).observe(canvas)
  const loop = (t) => {
    if (visible && !document.hidden) frame(t)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
