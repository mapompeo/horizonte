import { chapterAt, qualityAt, windowCross } from './story.js'

/** Todas as animações da página (Motion). Só é chamada com a Motion carregada e sem pedido de menos movimento. */
export function startScenes(M) {
  const root = document.documentElement
  root.classList.add('motion')
  const spring = { type: 'spring', visualDuration: 0.5, bounce: 0.2 }
  const soft = { type: 'spring', visualDuration: 0.9, bounce: 0.1 }
  const snappy = { type: 'spring', visualDuration: 0.35, bounce: 0.25 }
  const $ = (id) => document.getElementById(id)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const screens = [...document.querySelectorAll('#app [data-screen]')]
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
  ;(async function breathe() {
    const el = $('hero-mbps')
    const steps = [35, 40, 45, 40, 35, 30]
    for (let k = 0; ; k++) {
      await wait(k % 3 === 2 ? 2200 : 420)
      el.textContent = steps[k % steps.length] + ' Mbps'
      M.animate(el, { scale: [1.1, 1] }, snappy)
    }
  })()

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
  const bar = $('app-bar')
  const cur = $('app-cur')
  const caps = [...document.querySelectorAll('.cap')]
  const dots = [...document.querySelectorAll('#dots i')]
  const SCREEN_OF = ['welcome', 'choose', 'discover', null, 'connected']
  const ANGLE = [
    { rotateY: -10, rotateX: 6 },
    { rotateY: 8, rotateX: 4 },
    { rotateY: -6, rotateX: 2 },
    { rotateY: 0, rotateX: 0 },
    { rotateY: 0, rotateX: 0 }
  ]
  let current = -1
  let token = 0
  screens.forEach((s) => (s.style.opacity = '0'))
  bar.style.opacity = '0'

  function setMode(mode) {
    const recv = mode === 'receive'
    $('m-send').classList.toggle('on', !recv)
    $('m-recv').classList.toggle('on', recv)
    M.animate($('app-thumb'), { x: recv ? app.clientWidth * 0.124 : 0 }, spring)
  }
  async function click(el, t) {
    const a = app.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const sx = a.width / app.offsetWidth || 1
    await M.animate(cur, { x: (r.left - a.left + r.width * 0.55) / sx, y: (r.top - a.top + r.height * 0.55) / sx, opacity: 1 }, { type: 'spring', visualDuration: 0.7, bounce: 0.1 }).finished
    if (t !== token) return false
    await M.animate(el, { scale: [1, 0.93, 1] }, { duration: 0.3 }).finished
    return t === token
  }
  function showScreen(name) {
    screens.forEach((s) => {
      const on = s.dataset.screen === name
      M.animate(s, on ? { opacity: 1, scale: [0.96, 1], filter: ['blur(8px)', 'blur(0px)'] } : { opacity: 0, scale: 1.03, filter: 'blur(8px)' }, on ? soft : { duration: 0.25 })
    })
    M.animate(bar, { opacity: name === 'discover' || name === 'connected' ? 1 : 0 }, { duration: 0.3 })
  }

  async function enter(i, prev) {
    const t = ++token
    const dir = i > prev ? 1 : -1
    caps.forEach((c, k) => {
      if (k === i) M.animate(c, { opacity: [0, 1], y: [24 * dir, 0], filter: ['blur(6px)', 'blur(0px)'] }, soft)
      else if (k === prev) M.animate(c, { opacity: 0, y: -24 * dir, filter: 'blur(6px)' }, { duration: 0.3 })
      else c.style.opacity = '0'
    })
    dots.forEach((d, k) => {
      d.classList.toggle('on', k === i)
      M.animate(d, { width: k === i ? '28px' : '8px' }, spring)
    })
    const isDevices = i === 3
    M.animate(app, isDevices ? { opacity: 0, scale: 0.8, y: 40, rotateX: 12 } : { opacity: 1, scale: 1, y: 0, ...ANGLE[i] }, soft)
    M.animate(devices, isDevices ? { opacity: 1, scale: [1.08, 1], y: [30, 0] } : { opacity: 0, scale: 0.95, y: 20 }, soft)
    if (SCREEN_OF[i]) showScreen(SCREEN_OF[i])
    M.animate(cur, { opacity: 0 }, { duration: 0.2 })
    $('b-recv').classList.toggle('picked', false)

    if (i === 0) {
      await wait(500)
      if (t === token) await click($('b-start'), t)
    } else if (i === 1) {
      await wait(400)
      if (t === token && (await click($('b-recv'), t))) $('b-recv').classList.add('picked')
    } else if (i === 2) {
      setMode('receive')
      M.animate($('host'), { opacity: 0, y: 18, scale: 0.96 }, { duration: 0 })
      M.animate($('searching'), { opacity: [0.4, 1, 0.4] }, { duration: 1.6, repeat: Infinity })
      await wait(800)
      if (t !== token) return
      M.animate($('host'), { opacity: 1, y: 0, scale: 1 }, snappy)
      await wait(650)
      if (t === token) await click($('b-extend'), t)
    } else if (i === 4) {
      setMode('send')
      M.animate($('app-pill'), { scale: [0.7, 1.06, 1], opacity: [0, 1, 1] }, { duration: 0.6, delay: 0.2 })
    }
  }

  const winA = $('win-a'), winB = $('win-b'), curA = $('cur-a'), curB = $('cur-b')
  function scrubWindow(p) {
    const w = windowCross(p, { a: $('screen-a').clientWidth, b: $('screen-b').clientWidth })
    winA.style.transform = `translateX(${w.aX}px)`
    curA.style.transform = `translateX(${w.aCursor}px)`
    curA.style.opacity = w.aCursorVisible ? '1' : '0'
    winB.style.transform = `translateX(${w.bX}px) rotate(${w.bTilt}deg)`
    curB.style.transform = `translateX(${w.bCursor}px)`
    curB.style.opacity = w.bCursorVisible ? '1' : '0'
  }
  let lastMbps = 30
  function scrubQuality(p) {
    const v = qualityAt(p)
    if (v !== lastMbps) {
      lastMbps = v
      $('mbps').textContent = v + ' Mbps'
      M.animate($('mbps'), { scale: [1.12, 1] }, snappy)
      M.animate($('b-plus'), { scale: [0.88, 1] }, snappy)
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
