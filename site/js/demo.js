import { DEVICE, HOST, initialState, isHostAddress, profileOf, reduce } from './demo-state.js'

const GEAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>'
const BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>'
const DESKTOP =
  '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="36" height="24" rx="4" /><path d="M16 40h16M24 32v8" /></svg>'
const LAPTOP =
  '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="10" width="30" height="21" rx="3.5" /><path d="M4 37h40" /></svg>'

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pill = (text) => `<span class="dpill">${text}</span>`
const btn = (act, label, cls = '', extra = '') =>
  `<button class="dbtn ${cls}" data-act="${act}" data-key="${act}${extra}">${label}</button>`

function stepper(bitrate) {
  return `<div class="dstepper">
    <button class="dround" data-act="step" data-v="-1" data-key="step-1" aria-label="Diminuir qualidade">−</button>
    <div class="dval"><b>${bitrate} Mbps</b><small>Qualidade</small></div>
    <button class="dround" data-act="step" data-v="1" data-key="step1" aria-label="Aumentar qualidade">+</button>
  </div>`
}

function segmented(label, key, value, options) {
  const on = options.findIndex((o) => String(o.v) === String(value))
  return `<div class="dseg" role="group" aria-label="${label}" style="--n:${options.length};--i:${Math.max(on, 0)}">
    <span class="dthumb"></span>
    ${options.map((o) => `<button class="${String(o.v) === String(value) ? 'on' : ''}" data-act="setting" data-k="${key}" data-v="${o.v}" data-key="s-${key}-${o.v}" aria-pressed="${String(o.v) === String(value)}">${o.t}</button>`).join('')}
  </div>`
}

function settingsView(s, version, copied) {
  const profile = profileOf(s.bitrate)
  const tile = (id, name, mbps) =>
    `<button class="dtile ${profile === id ? 'on' : ''}" data-act="bitrate" data-v="${mbps}" data-key="t-${id}" aria-pressed="${profile === id}"><b>${name}</b><small>${mbps} Mbps</small></button>`
  const c = s.settings
  return `<section>
      <h3>Qualidade</h3>
      <div class="dtiles">${tile('economico', 'Econômico', 10)}${tile('equilibrado', 'Equilibrado', 30)}${tile('maximo', 'Máximo', 60)}</div>
      <div class="dcard dpad"><div class="drow"><label for="d-range">Personalizado</label><strong id="d-range-val">${s.bitrate} Mbps</strong></div>
      <input id="d-range" type="range" min="5" max="80" value="${s.bitrate}" data-key="range"></div>
      <p class="dnote">Em Wi-Fi 5 GHz, de 30 a 50 Mbps costuma ficar nítido.</p>
    </section>
    <section>
      <h3>Este dispositivo</h3>
      <div class="dcard">
        <div class="drow"><span>Abrir com o sistema</span><button class="dtoggle ${c.autostart ? 'on' : ''}" role="switch" aria-checked="${c.autostart}" aria-label="Abrir com o sistema" data-act="toggle" data-key="toggle"><i></i></button></div>
        <div class="drow"><span>Nome deste dispositivo</span><span class="dmuted">${HOST.name}</span></div>
      </div>
    </section>
    <section>
      <h3>Avançado</h3>
      <div class="dcard dpad dstack">
        <span class="dlabel">Resolução</span>${segmented('Resolução', 'resolution', c.resolution, [{ v: '720p', t: '720p' }, { v: '1080p', t: '1080p' }, { v: '1440p', t: '1440p' }])}
        <span class="dlabel">Quadros por segundo</span>${segmented('Quadros por segundo', 'fps', c.fps, [{ v: 30, t: '30' }, { v: 60, t: '60' }, { v: 120, t: '120' }])}
        <span class="dlabel">Codificação</span>${segmented('Codificação', 'encoding', c.encoding, [{ v: 'auto', t: 'Automática' }, { v: 'gpu', t: 'Placa de vídeo' }, { v: 'cpu', t: 'Processador' }])}
        <span class="dlabel">Codec</span>${segmented('Codec', 'codec', c.codec, [{ v: 'h264', t: 'H.264' }, { v: 'hevc', t: 'HEVC' }, { v: 'av1', t: 'AV1' }])}
      </div>
    </section>
    <div class="dfoot"><span>Horizonte ${version}</span><span><a href="https://github.com/mapompeo/horizonte" data-key="gh">GitHub</a><button data-act="copy" data-key="copy">${copied ? 'Copiado' : 'Copiar diagnóstico'}</button></span></div>`
}

function screenView(state, ui) {
  switch (state.screen) {
    case 'ready':
      return `${pill('Aguardando conexão').replace('dpill', 'dpill wait')}
        <h1>Pronto.</h1>
        <p class="dsub">Abra o Horizonte no outro dispositivo e selecione ${HOST.name}.</p>
        ${btn('web', state.web ? 'Parar de receber pelo navegador' : 'Receber pelo navegador (sem instalar nada)', 'out sm')}
        ${state.web ? `<p class="dhint">No outro dispositivo, abra <b>http://${HOST.address}:8080</b> e entre com o usuário <b>horizonte</b> e o código <b>4821</b>.</p>` : ''}`
    case 'approve':
      return `<div class="dbadge">${LAPTOP}</div>
        <h1 class="md">Permitir o ${DEVICE}?</h1>
        <p class="dsub">Ele quer usar este dispositivo como segunda tela.</p>
        <div class="dstack2">${btn('approve', 'Permitir', 'pri')}${btn('deny', 'Recusar', 'ghost')}</div>
        <span class="dfaint">${DEVICE} · mesma rede</span>`
    case 'connected':
      return `${pill(`${DEVICE} conectado`)}<h1>Tela estendida.</h1>${stepper(state.bitrate)}${btn('stop', 'Parar', 'out')}`
    case 'discover':
      return `<h1 class="md">Na sua rede</h1>
        <div class="dhost"><div class="dhicon">${DESKTOP}</div><div class="dhbody"><b>${HOST.name}</b><span>${HOST.address} · pronto</span></div>${btn('extend', 'Estender', 'pri sm')}</div>
        <span class="dsearch">Procurando outros dispositivos…</span>
        ${
          state.manual
            ? `<form class="dmanual" data-form="ip"><input aria-label="Endereço do outro dispositivo" placeholder="192.168.1.5" autocomplete="off" spellcheck="false" value="${esc(ui.ip)}" data-key="ip"><button class="dbtn pri sm" type="submit" ${isHostAddress(ui.ip) ? '' : 'disabled'} data-key="ipgo">Conectar</button></form>`
            : `<button class="dlink" data-act="manual" data-key="manual">Não aparece? Adicionar pelo IP</button>`
        }`
    case 'receiving':
      return `${pill(HOST.name)}<h1>Recebendo a tela.</h1>${stepper(state.bitrate)}${btn('stop', 'Sair', 'out')}`
    default:
      return ''
  }
}

/** Liga o app da página: clique em qualquer botão faz o que a versão atual do Horizonte faz. */
export function mountDemo(root, { version = '0.1.0' } = {}) {
  let state = initialState()
  const ui = { ip: '', copied: false }
  let timer = null
  let interacted = false

  root.setAttribute('aria-label', 'Demonstração do Horizonte: clique para experimentar')
  root.setAttribute('role', 'group')
  root.classList.add('demo', 'hint')

  const dispatch = (action) => {
    state = reduce(state, action)
    render()
  }

  function render() {
    clearTimeout(timer)
    const activeKey = document.activeElement?.dataset?.key
    const settings = state.screen === 'settings'
    const bar = settings
      ? `<div class="bar dbar"><button class="dback" data-act="close" data-key="close">${BACK}Voltar</button><b class="dtitle">Ajustes</b><span></span></div>`
      : `<div class="bar dbar"><button class="dgear" data-act="settings" data-key="settings" aria-label="Ajustes">${GEAR}</button>
          <div class="aseg" data-mode="${state.mode}"><span class="athumb"></span>
            <button class="${state.mode === 'send' ? 'on' : ''}" data-act="mode" data-v="send" data-key="m-send" aria-pressed="${state.mode === 'send'}">Enviar</button>
            <button class="${state.mode === 'receive' ? 'on' : ''}" data-act="mode" data-v="receive" data-key="m-recv" aria-pressed="${state.mode === 'receive'}">Mostrar</button></div><span></span></div>`
    const body = settings ? settingsView(state, version, ui.copied) : screenView(state, ui)
    root.innerHTML = `<div class="controls" aria-hidden="true"><span>_</span><span>▢</span><span>✕</span></div>${bar}<div class="scr dscr ${settings ? 'sheet' : ''}" data-screen-name="${state.screen}">${body}</div>`
    if (activeKey) root.querySelector(`[data-key="${activeKey}"]`)?.focus({ preventScroll: true })
    if (state.screen === 'ready' && !state.web) timer = setTimeout(() => dispatch({ type: 'REQUEST' }), 6000)
  }

  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act]')
    if (!el || !root.contains(el)) return
    interacted = true
    root.classList.remove('hint')
    const v = el.dataset.v
    switch (el.dataset.act) {
      case 'mode':
        return dispatch({ type: 'MODE', mode: v })
      case 'settings':
        return dispatch({ type: 'OPEN_SETTINGS' })
      case 'close':
        return dispatch({ type: 'CLOSE_SETTINGS' })
      case 'approve':
        return dispatch({ type: 'APPROVE' })
      case 'deny':
        return dispatch({ type: 'DENY' })
      case 'stop':
        return dispatch({ type: 'STOP' })
      case 'extend':
        return dispatch({ type: 'EXTEND' })
      case 'manual':
        return dispatch({ type: 'MANUAL' })
      case 'web':
        return dispatch({ type: 'WEB' })
      case 'step':
        return dispatch({ type: 'STEP', direction: Number(v) })
      case 'bitrate':
        return dispatch({ type: 'BITRATE', mbps: Number(v) })
      case 'toggle':
        return dispatch({ type: 'SETTING', key: 'autostart', value: !state.settings.autostart })
      case 'setting': {
        const value = el.dataset.k === 'fps' ? Number(v) : v
        return dispatch({ type: 'SETTING', key: el.dataset.k, value })
      }
      case 'copy':
        ui.copied = true
        render()
        setTimeout(() => {
          ui.copied = false
          if (state.screen === 'settings') render()
        }, 2000)
    }
  })

  // O slider muda o número enquanto arrasta e só redesenha ao soltar, para não largar o dedo no meio.
  root.addEventListener('input', (event) => {
    const t = event.target
    if (t.id === 'd-range') {
      state = reduce(state, { type: 'BITRATE', mbps: Number(t.value) })
      root.querySelector('#d-range-val').textContent = state.bitrate + ' Mbps'
      return
    }
    if (t.dataset?.key === 'ip') {
      ui.ip = t.value
      const go = root.querySelector('[data-key="ipgo"]')
      if (go) go.disabled = !isHostAddress(ui.ip)
    }
  })
  root.addEventListener('change', (event) => {
    if (event.target.id === 'd-range') render()
  })
  root.addEventListener('submit', (event) => {
    event.preventDefault()
    if (isHostAddress(ui.ip)) dispatch({ type: 'EXTEND' })
  })

  render()
  return { get interacted() { return interacted } }
}
