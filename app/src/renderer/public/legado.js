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
    601: {
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
    602: {
      pt: ['O computador está ocupado', 'Espere um pouco e toque em Conectar.'],
      en: ['The computer is busy', 'Wait a moment and tap Connect.'],
      es: ['La computadora está ocupada', 'Espera un poco y toca Conectar.']
    },
    603: {
      pt: ['O computador não permitiu', 'Toque em Conectar e escolha Permitir no computador.'],
      en: ['The computer did not allow it', 'Tap Connect and choose Allow on the computer.'],
      es: ['La computadora no lo permitió', 'Toca Conectar y elige Permitir en la computadora.']
    },
    605: {
      pt: ['A conexão caiu', 'Toque em Conectar.'],
      en: ['The connection dropped', 'Tap Connect.'],
      es: ['Se cayó la conexión', 'Toca Conectar.']
    },
    608: {
      pt: [
        'A imagem da tela não chegou ao aparelho',
        'Feche e abra o Horizonte no computador e toque em Conectar no aparelho.'
      ],
      en: [
        'The screen image did not reach the device',
        'Close and open Horizonte on the computer and tap Connect on the device.'
      ],
      es: [
        'La imagen de la pantalla no llegó al dispositivo',
        'Cierra y abre Horizonte en la computadora y toca Conectar en el dispositivo.'
      ]
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

  /** Onde a tela aparece (os toques vão nela) e as imagens dentro dela. */
  var box = null
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

  /**
   * O que a página viu (imagem que não carregou, troca de jeito) vai para o log do computador (navegador.log): num
   * iPad antigo não há console para olhar.
   */
  function diag(event, n) {
    if (session) post('/api/diag?sessao=' + session + '&e=' + event + '&n=' + (n || 0), {})
  }

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

  /**
   * Sem nenhuma imagem este tempo depois de o computador aceitar, ou com as imagens falhando seguidas: a página para e
   * mostra o erro 608, com o que fazer, em vez de ficar em "Abrindo a tela…" (ou no "?") para sempre.
   */
  var FIRST_IMAGE_MS = 20000
  var MAX_FAILURES = 30

  /** Chamado ao sair da sessão: para os relógios da sessão (o da imagem e o do MJPEG). */
  var stopScreen = null

  function finish(message) {
    if (stopScreen) stopScreen()
    stopScreen = null
    if (events) events.close()
    if (session) post('/api/fechar?sessao=' + session, {})
    events = session = wide = null
    // Sai com as imagens: ao reconectar, nada da sessão anterior fica na tela.
    if (box && box.parentNode) box.parentNode.removeChild(box)
    box = null
    start.hidden = false
    button.disabled = false
    say(message)
  }

  /**
   * As imagens carregam escondidas e só aparecem depois de prontas: uma imagem que falha (o "?" do Safari) nunca fica à
   * vista, e a tela mostra a última que deu certo até chegar a próxima.
   */
  function hiddenImage(root) {
    var image = document.createElement('img')
    image.alt = ''
    var style = image.style
    style.position = 'absolute'
    style.left = style.top = '0'
    style.width = '100%'
    style.height = '100%'
    style.visibility = 'hidden'
    root.appendChild(image)
    return image
  }

  function showImage(send, width) {
    var root = (box = document.createElement('div'))
    /** Falso depois que a sessão acaba: o que chegar atrasado dela (uma imagem, um relógio) não mexe na próxima. */
    var alive = true
    var style = root.style
    style.position = 'fixed'
    style.left = style.top = '0'
    style.width = '100%'
    style.height = '100%'
    style.zIndex = '3'
    var shown = null
    /** Desiste com o erro 608: avisa o computador antes (o app dele mostra o mesmo aviso) e só então encerra. */
    function giveUp(event) {
      if (!alive) return
      alive = false
      if (session) post('/api/diag?sessao=' + session + '&e=' + event + '&n=0', {}, done608)
      else done608()
    }
    function done608() {
      finish('608')
    }
    var firstImage = setTimeout(function () {
      giveUp('sem-imagem')
    }, FIRST_IMAGE_MS)
    /** Mostra uma imagem que já carregou, no lugar da anterior. */
    function reveal(image) {
      if (!alive || shown === image) return
      clearTimeout(firstImage)
      image.style.visibility = 'visible'
      if (shown) shown.style.visibility = 'hidden'
      shown = image
      root.style.background = '#000'
      start.hidden = true
      tries = 0
    }

    // Primeiro o MJPEG (uma resposta só, a imagem anda sozinha). Se em 6 s não aparecer nada (navegador que não
    // mostra MJPEG), se der erro, ou se o computador avisar que ele parou, cai para uma imagem por vez.
    mode = forceFrames ? 'quadro' : 'video'
    var video = null
    var since = new Date().getTime()
    var check = setInterval(function () {
      if (!alive || mode !== 'video') return clearInterval(check)
      // Só vale a imagem do tamanho pedido: o Safari antigo dá tamanho até ao ícone de imagem quebrada ("?").
      if (video.naturalWidth === width) {
        reveal(video)
        return clearInterval(check)
      }
      if (new Date().getTime() - since > 6000) toFrames('mjpeg-sem-imagem')
    }, 250)

    // Uma imagem por vez: duas <img> que se revezam (uma à vista, a outra carregando a próxima).
    var spare = [hiddenImage(root), hiddenImage(root)]
    var loading = null
    var again = false
    var stalled = null
    var waitRetry = null
    /** Falhas seguidas: o log do computador recebe a primeira e depois uma a cada 30, não uma por segundo. */
    var failures = 0
    function done(image, ok) {
      clearTimeout(stalled)
      image.onload = image.onerror = null
      if (!alive) return
      loading = null
      if (ok) {
        failures = 0
        reveal(image)
        if (video && video !== shown) {
          video.parentNode.removeChild(video)
          video = null
        }
      } else {
        if (failures++ % 30 === 0) diag('quadro-falhou', failures)
        if (failures >= MAX_FAILURES) return giveUp('imagens-falhando')
        // A tela parada não manda imagem nova: pede a mesma de novo daqui a pouco em vez de ficar sem nada.
        again = false
        waitRetry = setTimeout(loadFrame, 1000)
      }
      send({ t: 'more' })
      if (again) {
        again = false
        loadFrame()
      }
    }
    function loadFrame() {
      if (!alive || mode !== 'quadro') return
      // Aviso que chegou com outra ainda carregando: vem logo depois dela.
      if (loading) {
        again = true
        return
      }
      clearTimeout(waitRetry)
      var image = spare[0] === shown ? spare[1] : spare[0]
      loading = image
      image.onload = function () {
        done(image, image.naturalWidth > 0)
      }
      image.onerror = function () {
        done(image, false)
      }
      // Pedido que não termina (Wi-Fi ruim): desiste e pede de novo, em vez de parar a tela.
      stalled = setTimeout(function () {
        if (loading === image) done(image, false)
      }, 10000)
      image.src = frameUrl()
    }
    function toFrames(reason) {
      if (!alive || mode === 'quadro') return
      mode = 'quadro'
      diag(reason, 0)
      // MJPEG que nunca apareceu sai já; o que estava à vista fica até a primeira imagem avulsa chegar.
      if (video && video !== shown) {
        video.parentNode.removeChild(video)
        video = null
      }
      loadFrame()
    }
    if (mode === 'video') {
      video = hiddenImage(root)
      video.onerror = function () {
        toFrames('mjpeg-erro')
      }
      video.src = '/api/video?sessao=' + session
    }
    stopScreen = function () {
      alive = false
      clearTimeout(firstImage)
      clearInterval(check)
      clearTimeout(stalled)
      clearTimeout(waitRetry)
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
    root.addEventListener(
      'touchstart',
      function (e) {
        touch('down', e)
      },
      false
    )
    root.addEventListener(
      'touchmove',
      function (e) {
        touch('move', e)
      },
      false
    )
    root.addEventListener(
      'touchend',
      function (e) {
        touch('up', e)
      },
      false
    )
    root.addEventListener(
      'touchcancel',
      function (e) {
        touch('up', e)
      },
      false
    )
    document.body.appendChild(root)
    return { frame: loadFrame, noVideo: toFrames }
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
        var failed = status === 429 ? '602' : '601'
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
      var screen = null
      events = new EventSource('/api/eventos?sessao=' + session)
      events.addEventListener(
        'fim',
        function () {
          finish(T.ended)
        },
        false
      )
      events.onerror = function () {
        if (events && events.readyState === 2) retry('605')
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
          screen = showImage(send, width)
          send({
            t: 'want',
            width: width,
            height: height,
            fps: 30,
            bitrate: 2,
            codecs: [],
            jpeg: true
          })
        } else if (message.t === 'denied') finish('603')
        else if (message.t === 'quadro' && screen) screen.frame()
        else if (message.t === 'semvideo' && screen) screen.noVideo('mjpeg-parado')
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
