/*
 * Modo compatível da página de receber, para navegador antigo (iPad ou iPhone antes do iOS 15.4), que não roda o
 * receptor WebRTC. Escrito em JavaScript antigo (ES5), sem build, para rodar até no Safari do iOS 9. A tela chega em
 * imagens JPEG pela mesma sinalização (Server-Sent Events) e o toque vira toque na tela estendida.
 * Em navegador novo, não faz nada: quem cuida é a página normal (src/web/main.ts).
 */
;(function () {
  'use strict'
  var modern =
    typeof window.RTCPeerConnection === 'function' &&
    typeof Object.hasOwn === 'function' &&
    !!window.HTMLVideoElement &&
    typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function'
  // `?compat` no endereço força o modo compatível (para testar num navegador novo).
  if (modern && !/[?&]compat\b/.test(location.search)) return

  var TEXT = {
    pt: {
      connecting: 'Conectando…',
      waiting: 'Aguardando o computador…',
      allow: 'Toque em Permitir no computador.',
      opening: 'Abrindo a tela…',
      ended: 'O computador encerrou a conexão.',
      reconnecting: 'Reconectando…',
      turning: 'Girando a tela…',
      code: 'Código',
      howToFix: 'Como resolver',
      tip: 'Para tela cheia: Compartilhar, Adicionar à Tela de Início. Para a tela não apagar: Bloqueio Automático em Nunca, nos Ajustes.'
    },
    en: {
      connecting: 'Connecting…',
      waiting: 'Waiting for the computer…',
      allow: 'Tap Allow on the computer.',
      opening: 'Opening the screen…',
      ended: 'The computer ended the connection.',
      reconnecting: 'Reconnecting…',
      turning: 'Rotating the screen…',
      code: 'Code',
      howToFix: 'How to fix',
      tip: 'For full screen: Share, Add to Home Screen. To keep the screen on: set Auto-Lock to Never in Settings.'
    },
    es: {
      connecting: 'Conectando…',
      waiting: 'Esperando la computadora…',
      allow: 'Toca Permitir en la computadora.',
      opening: 'Abriendo la pantalla…',
      ended: 'La computadora cerró la conexión.',
      reconnecting: 'Reconectando…',
      turning: 'Girando la pantalla…',
      code: 'Código',
      howToFix: 'Cómo resolverlo',
      tip: 'Para pantalla completa: Compartir, Agregar a inicio. Para que no se apague: Bloqueo automático en Nunca, en Ajustes.'
    }
  }
  /** Os erros que esta página mostra, iguais aos do catálogo do app (src/shared/errors.ts; um teste confere). */
  var ERRORS = {
    'HZ-601': {
      pt: [
        'O computador não respondeu',
        'Confira se o Horizonte está aberto em Enviar no computador, na mesma rede Wi-Fi.'
      ],
      en: [
        'The computer did not answer',
        'Check that Horizonte is open on Send on the computer, on the same Wi-Fi network.'
      ],
      es: [
        'La computadora no respondió',
        'Revisa que Horizonte esté abierto en Enviar en la computadora, en la misma red Wi-Fi.'
      ]
    },
    'HZ-602': {
      pt: ['O computador está ocupado', 'Espere um pouco e toque em Conectar.'],
      en: ['The computer is busy', 'Wait a moment and tap Connect.'],
      es: ['La computadora está ocupada', 'Espera un poco y toca Conectar.']
    },
    'HZ-603': {
      pt: ['O computador não permitiu', 'Toque em Conectar e escolha Permitir no computador.'],
      en: ['The computer did not allow it', 'Tap Connect and choose Allow on the computer.'],
      es: ['La computadora no lo permitió', 'Toca Conectar y elige Permitir en la computadora.']
    },
    'HZ-605': {
      pt: ['A conexão caiu', 'Toque em Conectar.'],
      en: ['The connection dropped', 'Tap Connect.'],
      es: ['Se cayó la conexión', 'Toca Conectar.']
    }
  }
  var HELP = 'https://horizonte-monitor.vercel.app/erros#'

  var code = String(navigator.language || 'pt')
    .slice(0, 2)
    .toLowerCase()
  var lang = TEXT[code] ? code : 'pt'
  var T = TEXT[lang]

  var start = document.getElementById('inicio')
  var text = document.getElementById('texto')
  var form = document.getElementById('form')
  var button = document.getElementById('entrar')

  /** Erro: o que aconteceu, o que fazer e o código, no mesmo jeito do app. Andamento: só o texto. */
  function sayError(id) {
    var entry = ERRORS[id][lang]
    text.innerHTML = ''
    var title = document.createElement('b')
    title.textContent = entry[0] + '.'
    var help = document.createElement('a')
    help.href = HELP + id
    help.target = '_blank'
    help.textContent = T.howToFix
    var small = document.createElement('span')
    small.className = 'web-code'
    small.appendChild(document.createTextNode(T.code + ' ' + id + ' · '))
    small.appendChild(help)
    text.appendChild(title)
    text.appendChild(document.createTextNode(' ' + entry[1]))
    text.appendChild(small)
  }

  function say(message) {
    text.setAttribute('role', ERRORS[message] ? 'alert' : 'status')
    if (ERRORS[message]) sayError(message)
    else text.textContent = message
  }

  function post(path, body, done) {
    var xhr = new XMLHttpRequest()
    xhr.open('POST', path, true)
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && done) done(xhr.status, xhr.responseText)
    }
    xhr.send(JSON.stringify(body))
  }

  function hex(count, upper) {
    var out = []
    var bytes = new Uint8Array(count)
    window.crypto.getRandomValues(bytes)
    for (var i = 0; i < count; i++) out.push((bytes[i] < 16 ? '0' : '') + bytes[i].toString(16))
    return upper ? out.join(':').toUpperCase() : out.join('')
  }

  /** Id e "impressão digital" deste aparelho, guardados para o computador reconhecer da próxima vez. */
  function identity() {
    var saved = null
    try {
      saved = JSON.parse(localStorage.getItem('horizonte-legado') || 'null')
    } catch (e) {
      saved = null
    }
    if (saved && saved.id && saved.fp) return saved
    var made = { id: hex(16, false), fp: hex(32, true) }
    try {
      localStorage.setItem('horizonte-legado', JSON.stringify(made))
    } catch (e) {
      /* aba privada: vale só desta vez */
    }
    return made
  }

  function even(value, min) {
    return Math.max(min, Math.min(8192, Math.round(value / 2) * 2))
  }

  var image = null
  /** 'video' (MJPEG) ou 'quadro' (uma imagem por vez). `?compat=quadro` força o segundo (teste). */
  var mode = 'video'
  var forceFrames = /[?&]compat=quadro\b/.test(location.search)
  var frameNo = 0
  function frameUrl() {
    return '/api/quadro?sessao=' + session + '&n=' + ++frameNo
  }
  var events = null
  var session = null
  /** Deitado ou em pé na hora de conectar: se girar, a tela estendida é refeita no tamanho novo. */
  var wide = null

  /** A conexão caiu (Wi-Fi, tela do iPad apagou): tenta de novo sozinho algumas vezes antes de mostrar o erro. */
  var WAITS = [1000, 2000, 4000, 8000, 8000]
  var tries = 0
  function retry(message) {
    var wait = WAITS[tries++]
    finish(wait === undefined ? message : T.reconnecting)
    if (wait === undefined) {
      tries = 0
      return
    }
    button.disabled = true
    setTimeout(connect, wait)
  }

  var turning = null
  window.addEventListener(
    'resize',
    function () {
      clearTimeout(turning)
      turning = setTimeout(function () {
        if (!session || wide === window.innerWidth >= window.innerHeight) return
        finish(T.turning)
        connect()
      }, 700)
    },
    false
  )

  function finish(message) {
    if (events) events.close()
    if (session) post('/api/fechar?sessao=' + session, {})
    events = session = wide = null
    if (image && image.parentNode) image.parentNode.removeChild(image)
    image = null
    start.hidden = false
    button.disabled = false
    say(message)
  }

  function showImage(send) {
    image = document.createElement('img')
    image.alt = ''
    var style = image.style
    style.position = 'fixed'
    style.left = style.top = '0'
    style.width = '100%'
    style.height = '100%'
    style.zIndex = '3'
    style.background = '#000'
    // Primeiro o MJPEG (uma resposta só, a imagem anda sozinha). Se em 6 s não aparecer nada (navegador que não
    // mostra MJPEG), cai para uma imagem por vez, cada uma pedida pelo aviso `quadro`.
    mode = forceFrames ? 'quadro' : 'video'
    var since = new Date().getTime()
    var check = setInterval(function () {
      if (!image) return clearInterval(check)
      if (image.naturalWidth > 0) {
        start.hidden = true
        tries = 0
        return clearInterval(check)
      }
      if (mode === 'video' && new Date().getTime() - since > 6000) {
        mode = 'quadro'
        image.src = frameUrl()
      }
    }, 250)
    image.onload = function () {
      if (mode !== 'quadro') return
      start.hidden = true
      tries = 0
      send({ t: 'more' })
    }
    // Imagem que não carregou: pede a próxima em vez de parar.
    image.onerror = function () {
      if (mode === 'quadro') send({ t: 'more' })
    }
    // Um dedo vira o toque da tela estendida. Uma mensagem por vez e na ordem (o "soltar" não passa na frente do
    // movimento); movimentos na fila viram só o mais recente.
    var queue = []
    var sending = false
    function pump() {
      if (sending || !queue.length || !session) return
      sending = true
      post('/api/enviar?sessao=' + session, { t: 'input', raw: queue.shift().raw }, function () {
        sending = false
        pump()
      })
    }
    function touch(phase, event) {
      event.preventDefault()
      var point = event.changedTouches[0]
      if (!point) return
      var x = Math.max(0, Math.min(1, point.clientX / window.innerWidth))
      var y = Math.max(0, Math.min(1, point.clientY / window.innerHeight))
      var raw = JSON.stringify({ t: 'touch', id: 0, phase: phase, x: x, y: y })
      var last = queue[queue.length - 1]
      if (phase === 'move' && last && last.phase === 'move') last.raw = raw
      else queue.push({ phase: phase, raw: raw })
      pump()
    }
    image.addEventListener(
      'touchstart',
      function (e) {
        touch('down', e)
      },
      false
    )
    image.addEventListener(
      'touchmove',
      function (e) {
        touch('move', e)
      },
      false
    )
    image.addEventListener(
      'touchend',
      function (e) {
        touch('up', e)
      },
      false
    )
    image.addEventListener(
      'touchcancel',
      function (e) {
        touch('up', e)
      },
      false
    )
    document.body.appendChild(image)
  }

  function connect() {
    button.disabled = true
    say(T.connecting)
    post('/api/abrir', {}, function (status, body) {
      var reply = {}
      try {
        reply = JSON.parse(body)
      } catch (e) {
        reply = {}
      }
      if (status !== 200 || !reply.sessao) {
        var failed = status === 429 ? 'HZ-602' : 'HZ-601'
        return tries ? retry(failed) : finish(failed)
      }
      session = reply.sessao
      wide = window.innerWidth >= window.innerHeight
      var id = identity()
      var width = even(window.innerWidth, 160)
      var height = even(window.innerHeight, 120)
      function send(message) {
        if (session) post('/api/enviar?sessao=' + session, message)
      }
      events = new EventSource('/api/eventos?sessao=' + session)
      events.addEventListener(
        'fim',
        function () {
          finish(T.ended)
        },
        false
      )
      events.onerror = function () {
        if (events && events.readyState === 2) retry('HZ-605')
      }
      events.onmessage = function (event) {
        var message
        try {
          message = JSON.parse(event.data)
        } catch (e) {
          return
        }
        if (message.t === 'hello') say(T.waiting)
        else if (message.t === 'pending') say(T.allow)
        else if (message.t === 'accepted') {
          say(T.opening)
          showImage(send)
          if (mode === 'video') image.src = '/api/video?sessao=' + session
          send({
            t: 'want',
            width: width,
            height: height,
            fps: 30,
            bitrate: 2,
            codecs: [],
            jpeg: true
          })
        } else if (message.t === 'denied') finish('HZ-603')
        else if (message.t === 'quadro' && image && mode === 'quadro') image.src = frameUrl()
        else if (message.t === 'ping') send({ t: 'pong', at: message.at })
        else if (message.t === 'bye') finish(T.ended)
      }
      send({
        t: 'hello',
        v: 1,
        id: id.id,
        name: /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'iPad',
        kind: /iPhone/.test(navigator.userAgent) ? 'phone' : 'tablet',
        fp: id.fp,
        screen: { width: width, height: height }
      })
    })
  }

  // Aberto pelo Safari (não pela Tela de Início), mostra como ficar em tela cheia e sem a tela apagar.
  var tip = document.getElementById('dica')
  if (tip && navigator.standalone !== true) {
    tip.textContent = T.tip
    tip.hidden = false
  }

  form.addEventListener(
    'submit',
    function (event) {
      event.preventDefault()
      tries = 0
      connect()
    },
    false
  )
})()
