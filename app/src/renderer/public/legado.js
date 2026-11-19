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
      denied: 'O computador não permitiu.',
      ended: 'O computador encerrou a conexão.',
      dropped: 'A conexão caiu. Toque em Conectar.',
      noAnswer: 'Sem resposta do computador. Tente de novo.'
    },
    en: {
      connecting: 'Connecting…',
      waiting: 'Waiting for the computer…',
      allow: 'Tap Allow on the computer.',
      opening: 'Opening the screen…',
      denied: 'The computer did not allow it.',
      ended: 'The computer ended the connection.',
      dropped: 'The connection dropped. Tap Connect.',
      noAnswer: 'No answer from the computer. Try again.'
    },
    es: {
      connecting: 'Conectando…',
      waiting: 'Esperando la computadora…',
      allow: 'Toca Permitir en la computadora.',
      opening: 'Abriendo la pantalla…',
      denied: 'La computadora no lo permitió.',
      ended: 'La computadora cerró la conexión.',
      dropped: 'Se cayó la conexión. Toca Conectar.',
      noAnswer: 'Sin respuesta de la computadora. Inténtalo de nuevo.'
    }
  }
  var code = String(navigator.language || 'pt')
    .slice(0, 2)
    .toLowerCase()
  var T = TEXT[code] || TEXT.pt

  var start = document.getElementById('inicio')
  var text = document.getElementById('texto')
  var form = document.getElementById('form')
  var button = document.getElementById('entrar')

  function say(message, error) {
    text.textContent = message
    text.className = error ? 'web-text web-error' : 'web-text'
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
  var events = null
  var session = null

  function finish(message, error) {
    if (events) events.close()
    if (session) post('/api/fechar?sessao=' + session, {})
    events = session = null
    if (image && image.parentNode) image.parentNode.removeChild(image)
    image = null
    start.hidden = false
    button.disabled = false
    say(message, error)
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
    image.onload = function () {
      start.hidden = true
      send({ t: 'more' })
    }
    // Um dedo vira o toque da tela estendida; o movimento sai um por vez, só o mais recente.
    var moving = false
    var nextMove = null
    function touch(phase, event) {
      event.preventDefault()
      var point = event.changedTouches[0]
      if (!point) return
      var x = Math.max(0, Math.min(1, point.clientX / window.innerWidth))
      var y = Math.max(0, Math.min(1, point.clientY / window.innerHeight))
      var raw = JSON.stringify({ t: 'touch', id: 0, phase: phase, x: x, y: y })
      if (phase !== 'move') {
        nextMove = null
        return send({ t: 'input', raw: raw })
      }
      if (moving) {
        nextMove = raw
        return
      }
      moving = true
      ;(function go(value) {
        post('/api/enviar?sessao=' + session, { t: 'input', raw: value }, function () {
          var queued = nextMove
          nextMove = null
          if (queued) go(queued)
          else moving = false
        })
      })(raw)
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
      if (status !== 200 || !reply.sessao) return finish(T.noAnswer, true)
      session = reply.sessao
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
        if (events && events.readyState === 2) finish(T.dropped, true)
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
          send({
            t: 'want',
            width: width,
            height: height,
            fps: 30,
            bitrate: 2,
            codecs: [],
            jpeg: true
          })
        } else if (message.t === 'denied') finish(T.denied, true)
        else if (message.t === 'jpeg' && image && /^data:image\/jpeg;base64,/.test(message.data))
          image.src = message.data
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

  form.addEventListener(
    'submit',
    function (event) {
      event.preventDefault()
      connect()
    },
    false
  )
})()
