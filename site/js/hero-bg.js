// Fundo da primeira tela: um campo de caracteres que respira em ondas lentas (mais forte embaixo), uma garoa rara de
// dígitos descendo e um brilho que acompanha o mouse. Some no meio, atrás do título. Pausa fora da tela; com menos
// movimento pedido, desenha um quadro parado.

const CHARS = ' .·:-=+*'

export function mountHeroBackground(canvas) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const s = { w: 0, h: 0, cell: 12, cols: 0, rows: 0, drops: [], mx: -1e4, my: -1e4, color: '10,132,255' }

  const readColor = () => {
    // A cor de destaque do tema (--accent), em r,g,b.
    const probe = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const hex = /^#([0-9a-f]{6})$/i.exec(probe)
    if (hex) {
      const n = parseInt(hex[1], 16)
      s.color = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    }
  }

  const fit = () => {
    const r = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, r.width * dpr)
    canvas.height = Math.max(1, r.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
  }

  // Quanto o caractere aparece: quase nada atrás do título, cheio nas bordas.
  const veil = (x, y) => {
    const dx = (x - s.w / 2) / (s.w * 0.34)
    const dy = (y - s.h * 0.42) / (s.h * 0.26)
    return Math.min(1, Math.hypot(dx, dy) * 0.85)
  }

  function frame(t) {
    const { cell } = s
    ctx.clearRect(0, 0, s.w, s.h)
    ctx.font = `${cell - 1}px ui-monospace, "SF Mono", Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const x = c * cell + cell / 2
        const y = r * cell + cell / 2
        // Campo que respira.
        const n =
          Math.sin(c * 0.16 + t * 0.0005) +
          Math.sin(r * 0.25 - t * 0.00035 + c * 0.05) +
          Math.sin((c + r) * 0.08 + t * 0.00025)
        let v = ((n + 3) / 6) * (0.25 + 0.75 * (r / s.rows)) * 0.8
        let ch = null
        // Garoa de sinal.
        const d = s.drops[c]
        if (d?.on) {
          const tail = d.y - r
          if (tail >= 0 && tail <= 6) {
            const rain = 1 - tail / 6
            if (rain > v) {
              v = rain
              ch = String.fromCharCode(48 + ((c * 7 + r * 3 + Math.floor(t / 150)) % 10))
            }
          }
        }
        // Brilho em volta do mouse.
        const near = Math.hypot(x - s.mx, y - s.my)
        if (near < 140) v = Math.max(v, (1 - near / 140) * 0.95)
        v *= veil(x, y)
        if (v < 0.07) continue
        ctx.fillStyle = `rgba(${s.color},${(0.12 + v * 0.7).toFixed(3)})`
        ctx.fillText(ch ?? CHARS[Math.min(CHARS.length - 1, Math.floor(v * CHARS.length))], x, y)
      }
    }
    for (const d of s.drops) {
      d.y += d.v * 2.4
      if (d.y > s.rows + 8) {
        d.y = -Math.random() * 12
        d.on = Math.random() < 0.14
      }
    }
  }

  new ResizeObserver(fit).observe(canvas)
  fit()
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', readColor)
  new MutationObserver(readColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const host = canvas.parentElement
  host?.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    s.mx = e.clientX - r.left
    s.my = e.clientY - r.top
  })
  host?.addEventListener('pointerleave', () => {
    s.mx = s.my = -1e4
  })

  if (reduce) {
    frame(4000)
    return
  }
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
