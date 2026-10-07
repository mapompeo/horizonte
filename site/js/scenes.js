import { mountLive } from './live.js'
import { chapterAt, qualityAt, windowSpots } from './story.js'

/** Todas as animações da página (Motion). Só é chamada com a Motion carregada e sem pedido de menos movimento. */
export function startScenes(M) {
  const root = document.documentElement
  root.classList.add('motion')
  const spring = { type: 'spring', visualDuration: 0.5, bounce: 0.2 }
  const soft = { type: 'spring', visualDuration: 0.9, bounce: 0.1 }
  const snappy = { type: 'spring', visualDuration: 0.35, bounce: 0.25 }
  const $ = (id) => document.getElementById(id)

  /* ---------- Utilitários de texto ---------- */
  const splitWords = (el, cls) => {
    const words = el.textContent.trim().split(/\s+/)
    el.innerHTML = words.map((w) => '<span class="' + cls + '">' + w + '</span>').join(' ')
    return [...el.querySelectorAll('.' + cls)]
  }

  /* ============ 1. Abertura ============ */
  const l1 = splitWords(document.querySelector('#hero-title .l1'), 'word')
  const l2 = splitWords(document.querySelector('#hero-title .l2'), 'word')
  M.animate([...l1, ...l2], { opacity: [0, 1], y: [40, 0], filter: ['blur(14px)', 'blur(0px)'] }, { ...soft, delay: M.stagger(0.08) })
  M.animate('[data-hero]', { opacity: [0, 1], y: [18, 0] }, { ...soft, delay: M.stagger(0.1, { startDelay: 0.35 }) })
  M.animate('#tilt', { opacity: [0, 1], y: [120, 0] }, { ...soft, delay: 0.55 })
  M.animate('#glow', { opacity: [0, 1], scale: [0.6, 1] }, { duration: 2, delay: 0.8, ease: [0.32, 0.72, 0, 1] })

  // O app do topo: endireita ao rolar e inclina seguindo o mouse.
  M.scroll(M.animate('#hero-app', { rotateX: [20, 0], scale: [0.9, 1] }, { ease: 'linear' }), {
    target: $('showcase'),
    offset: ['start end', 'center center']
  })
  M.scroll(M.animate('#hero-app', { y: [0, -60], opacity: [1, 0.35] }, { ease: 'linear' }), {
    target: $('showcase'),
    offset: ['center center', 'end start']
  })
  M.scroll(M.animate('#glow', { scale: [1, 1.5], opacity: [1, 0] }, { ease: 'linear' }), {
    target: $('showcase'),
    offset: ['start end', 'end start']
  })
  const tilt = $('tilt')
  $('showcase').addEventListener('pointermove', (e) => {
    const r = tilt.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    M.animate(tilt, { rotateY: px * 8, rotateX: -py * 6 }, soft)
  })
  $('showcase').addEventListener('pointerleave', () => M.animate(tilt, { rotateY: 0, rotateX: 0 }, soft))

  /* ============ 2. Barra do topo some ao descer ============ */
  let lastY = scrollY
  let hidden = false
  addEventListener(
    'scroll',
    () => {
      const y = scrollY
      const down = y > lastY && y > 120
      if (down !== hidden) {
        hidden = down
        M.animate('#topbar', { y: down ? -60 : 0 }, spring)
      }
      lastY = y
    },
    { passive: true }
  )

  /* ============ 3. Frase que acende palavra por palavra ============ */
  const words = splitWords($('scrub'), 'w')
  M.scroll(
    (p) => {
      const lit = p * (words.length + 2)
      words.forEach((w, i) => (w.style.color = i < lit ? 'var(--fg)' : 'var(--dim)'))
    },
    { target: $('scrub'), offset: ['start 0.85', 'end 0.45'] }
  )

  /* ============ 4. Títulos sobem de trás de uma máscara ============ */
  document.querySelectorAll('[data-mask]').forEach((h) => {
    const lines = [...h.querySelectorAll('.mask > span')]
    lines.forEach((l) => (l.style.transform = 'translateY(105%)'))
    M.inView(
      h,
      () => {
        M.animate(lines, { y: ['105%', '0%'] }, { ...soft, delay: M.stagger(0.12) })
      },
      { amount: 0.4 }
    )
  })
  document.querySelectorAll('[data-rise], .num').forEach((el) => (el.style.opacity = '0'))
  M.inView(
    '[data-rise]',
    (el) => {
      M.animate(el, { opacity: [0, 1], y: [30, 0] }, soft)
    },
    { amount: 0.3 }
  )

  /* ============ 5. A história presa na tela ============ */
  const app = $('app')
  const devices = $('devices')
  const caps = [...document.querySelectorAll('.cap')]
  const dots = [...document.querySelectorAll('#dots i')]
  const live = mountLive(app, { auto: false })
  let current = -1
  let frameReady = false
  const states = [
    { screen: 'install', status: 'idle' },
    { screen: 'choose' },
    { screen: 'discover', mode: 'receive' },
    null,
    { screen: 'connected', mode: 'send', device: 'Notebook' }
  ]
  const syncDemo = () => {
    if (frameReady && states[current]) live.frame.contentWindow.__demo?.reset(states[current])
  }
  live.loaded.then(() => { frameReady = true; syncDemo() })
  function enter(i, prev) {
    caps.forEach((caption, k) => {
      M.animate(caption, { opacity: k === i ? 1 : 0, y: k === i ? 0 : -20 }, soft)
    })
    dots.forEach((dot, k) => {
      dot.classList.toggle('on', k === i)
      M.animate(dot, { width: k === i ? '28px' : '8px' }, spring)
    })
    const isDevices = i === 3
    $('stage').style.setProperty('--glow', 'rgba(10,132,255,.24)')
    M.animate(app, { opacity: isDevices ? 0 : 1, scale: isDevices ? .85 : 1, rotateY: i === 0 ? -6 : 0 }, soft)
    app.style.pointerEvents = isDevices ? 'none' : 'auto'
    M.animate(devices, { opacity: isDevices ? 1 : 0, scale: isDevices ? 1 : .95, y: isDevices ? 0 : 20 }, soft)
    syncDemo()
  }

  const deviceScreens = [...devices.querySelectorAll('.screen')]
  function scrubWindow(p) {
    const origin = deviceScreens[0].getBoundingClientRect()
    const scale = origin.width / deviceScreens[0].offsetWidth || 1
    const width = deviceScreens[0].clientWidth * .46
    const positions = deviceScreens.map((screen) => ({ left: (screen.getBoundingClientRect().left - origin.left) / scale, width: screen.clientWidth }))
    windowSpots(p, positions, width).forEach((x, i) => {
      const win = deviceScreens[i].querySelector('.win')
      win.style.width = width + 'px'
      win.style.left = '0'
      win.style.top = '50%'
      win.style.transform = `translate(${x}px, -50%)`
      const cursor = deviceScreens[i].querySelector('.dcur')
      if (cursor) cursor.style.opacity = '0'
    })
  }
  let lastMbps = 30
  function scrubQuality(p) {
    const v = qualityAt(p)
    if (v !== lastMbps) {
      lastMbps = v
      if (frameReady) live.frame.contentWindow.horizonte?.updateSettings({ bitrate: v })
    }
  }
  M.scroll(
    (progress) => {
      const { index: i, local } = chapterAt(progress)
      if (i !== current) {
        const prev = current
        current = i
        enter(i, prev)
      }
      if (i === 3) scrubWindow(local)
      if (i === 4) scrubQuality(local)
    },
    { target: $('story'), offset: ['start start', 'end end'] }
  )

  /* ============ 6. Números que contam ============ */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count)
    M.inView(
      el,
      () => {
        M.animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = String(Math.round(v))) })
        M.animate(el.closest('.num'), { opacity: [0, 1], y: [40, 0], scale: [0.94, 1] }, soft)
      },
      { amount: 0.6 }
    )
  })

  /* ============ 6b. Barra de progresso, sistemas, radar e recursos ============ */
  M.scroll(M.animate('#progress', { scaleX: [0, 1] }, { ease: 'linear' }))

  // Faixa de sistemas: acelera e inclina de leve conforme a rolagem
  const track = $('track')
  let skewTarget = 0
  let lastScroll = scrollY
  addEventListener(
    'scroll',
    () => {
      skewTarget = Math.max(-6, Math.min(6, (scrollY - lastScroll) * 0.25))
      lastScroll = scrollY
    },
    { passive: true }
  )
  ;(function settle() {
    skewTarget *= 0.9
    track.parentElement.style.transform = 'skewX(' + (-skewTarget).toFixed(2) + 'deg)'
    requestAnimationFrame(settle)
  })()

  // Matriz: os seis sistemas entram em mola e os pacotes passam a correr
  const chips = [...document.querySelectorAll('.chip')]
  chips.forEach((c) => (c.style.opacity = '0'))
  document.querySelectorAll('.mx-lines, .mx-tag').forEach((el) => (el.style.opacity = '0'))
  M.inView(
    $('mx'),
    () => {
      M.animate('.mx-lines', { opacity: [0, 1] }, { duration: 1.2, delay: 0.3 })
      M.animate('.mx-tag', { opacity: [0, 1], y: [10, 0] }, { ...soft, delay: 0.5 })
      chips.forEach((c, i) => {
        const side = c.classList.contains('l') ? -1 : 1
        M.animate(c, { opacity: [0, 1], x: [side * 40, 0], scale: [0.8, 1] }, { ...spring, delay: 0.15 * (i % 3) + (side === 1 ? 0.4 : 0) })
      })
    },
    { amount: 0.45 }
  )
  chips.forEach((c) => {
    c.addEventListener('pointerenter', () => M.animate(c, { scale: 1.08 }, snappy))
    c.addEventListener('pointerleave', () => M.animate(c, { scale: 1 }, spring))
  })

  // Radar: o aparelho central surge e os outros são encontrados um a um
  const radar = $('radar')
  // Os aparelhos acendem sozinhos, quando a varredura (CSS) passa por eles.
  radar.querySelector('.core').style.opacity = '0'
  M.inView(
    radar,
    () => {
      M.animate(radar.querySelector('.core'), { opacity: [0, 1], scale: [0.4, 1] }, spring)
    },
    { amount: 0.5 }
  )

  // Recursos: cartões sobem em cascata e a luz segue o mouse
  const tiles = [...document.querySelectorAll('[data-tile]')]
  tiles.forEach((t) => (t.style.opacity = '0'))
  M.inView(
    $('bento'),
    () => {
      M.animate(tiles, { opacity: [0, 1], y: [50, 0], scale: [0.94, 1] }, { ...soft, delay: M.stagger(0.09) })
    },
    { amount: 0.2 }
  )
  tiles.forEach((t) => {
    t.addEventListener('pointermove', (e) => {
      const r = t.getBoundingClientRect()
      t.style.setProperty('--mx', e.clientX - r.left + 'px')
      t.style.setProperty('--my', e.clientY - r.top + 'px')
    })
  })
  M.hover('[data-tile]', (el) => {
    M.animate(el, { y: -6, scale: 1.015 }, spring)
    return () => M.animate(el, { y: 0, scale: 1 }, spring)
  })

  // Resumo final: os quadrinhos pulam no lugar, de dentro para fora, e levantam ao passar o mouse
  const rts = [...document.querySelectorAll('[data-rt]')]
  rts.forEach((t) => (t.style.opacity = '0'))
  const center = document.querySelector('.rt-hero')
  const dist = (t) => {
    const a = t.getBoundingClientRect()
    const b = center.getBoundingClientRect()
    return Math.hypot(a.left + a.width / 2 - (b.left + b.width / 2), a.top + a.height / 2 - (b.top + b.height / 2))
  }
  M.inView(
    $('recap'),
    () => {
      const order = [...rts].sort((x, y) => dist(x) - dist(y))
      order.forEach((t, i) => M.animate(t, { opacity: [0, 1], scale: [0.6, 1], y: [30, 0] }, { ...spring, delay: 0.06 * i }))
    },
    { amount: 0.25 }
  )
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) rts.forEach((tile) => {
    tile.addEventListener('pointermove', (event) => {
      const rect = tile.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      tile.style.setProperty('--light-x', x + 'px')
      tile.style.setProperty('--light-y', y + 'px')
      M.animate(tile, { rotateY: (x / rect.width - .5) * 8, rotateX: (.5 - y / rect.height) * 8 }, snappy)
    })
    tile.addEventListener('pointerleave', () => M.animate(tile, { rotateX: 0, rotateY: 0 }, soft))
  })
  M.scroll(M.animate('.rt-hero img', { rotate: [-8, 8], scale: [.9, 1.12] }, { ease: 'linear' }), {
    target: $('recap'), offset: ['start end', 'end start']
  })
  M.hover('[data-rt]', (el) => {
    M.animate(el, { scale: 1.04, y: -4 }, spring)
    return () => M.animate(el, { scale: 1, y: 0 }, spring)
  })

  /* ============ 7. Botões atraídos pelo cursor, toque com mola ============ */
  document.querySelectorAll('.magnet').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      M.animate(el, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35 }, snappy)
    })
    el.addEventListener('pointerleave', () => M.animate(el, { x: 0, y: 0 }, spring))
  })
  M.press('.pillbtn, .linkbtn', (el) => {
    M.animate(el, { scale: 0.95 }, snappy)
    return () => M.animate(el, { scale: 1 }, spring)
  })
  M.hover('.os', (el) => {
    M.animate(el, { y: -8, scale: 1.02 }, spring)
    return () => M.animate(el, { y: 0, scale: 1 }, spring)
  })
  document.querySelectorAll('details').forEach((d) =>
    d.addEventListener('toggle', () => {
      if (d.open) M.animate(d.querySelector('.answer'), { opacity: [0, 1], y: [-10, 0] }, spring)
    })
  )
}
