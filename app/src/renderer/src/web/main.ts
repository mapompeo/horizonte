import '../motor/motor.css'
import './web.css'
import type { DeviceKind } from '../../../shared/device'
import type { MediaMessage, MotorApi } from '../../../shared/motor'
import { sdpFingerprint } from '../../../main/engine/webrtc/fingerprint'
import {
  PROTOCOL_VERSION,
  type Hello,
  type Message,
  type Want
} from '../../../main/engine/webrtc/protocol'
import { videoMimes } from '../motor/codecs'
import { loadIdentity } from '../motor/identity'
import { createReceiver } from '../motor/receiver'

/**
 * Receber a tela pelo navegador (tablet, celular, outro computador), sem instalar nada. Esta página faz o papel do
 * lado que mostra do app: manda o `hello`, espera o "Permitir" no computador, pede a tela (`want`) e liga o mesmo
 * receptor WebRTC do app. A sinalização passa pela ponte HTTP de quem envia (`main/web/browser.ts`).
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const start = $<HTMLElement>('inicio')
const text = $<HTMLParagraphElement>('texto')
const form = $<HTMLFormElement>('form')
const input = $<HTMLInputElement>('codigo')
const button = $<HTMLButtonElement>('entrar')

const DENIED: Record<string, string> = {
  user: 'O computador não permitiu.',
  busy: 'O computador está em uso. Tente depois.',
  version: 'Versões diferentes. Atualize a página.'
}

function say(message: string, error = false): void {
  text.textContent = message
  text.classList.toggle('web-error', error)
  text.setAttribute('role', error ? 'alert' : 'status')
}

function deviceOf(agent: string): { name: string; kind: DeviceKind } {
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1))
    return { name: 'iPad', kind: 'tablet' }
  if (/iPhone/.test(agent)) return { name: 'iPhone', kind: 'phone' }
  if (/Android/.test(agent))
    return /Mobile/.test(agent)
      ? { name: 'Celular Android', kind: 'phone' }
      : { name: 'Tablet Android', kind: 'tablet' }
  return { name: 'Navegador', kind: 'desktop' }
}

/**
 * Tamanho da tela estendida em pixels de verdade, par e dentro do que o protocolo aceita: a área visível da página (no
 * Safari do iPhone, sem as barras dele), deitada ou em pé, do jeito que o aparelho está. A imagem preenche tudo.
 */
function screenWant(): { width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const even = (value: number): number =>
    Math.max(160, Math.min(3840, Math.round((value * ratio) / 2) * 2))
  const view = window.visualViewport
  return {
    width: even(view?.width ?? window.innerWidth),
    height: even(view?.height ?? window.innerHeight)
  }
}

const landscape = (): boolean => window.innerWidth >= window.innerHeight

/**
 * Escala da tela estendida: a do aparelho, mas sem deixar a área útil com menos de 720 pontos de altura. Num celular
 * com escala 2, a tela teria uns 390 pontos de altura, e as janelas do computador (que têm um tamanho mínimo) não
 * conseguiam maximizar.
 */
const MIN_POINTS = 720
function screenScale(size: { width: number; height: number }): number | null {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  // O lado menor: deitado é a altura, em pé é a largura.
  const scale = Math.max(1, Math.min(ratio, Math.min(size.width, size.height) / MIN_POINTS))
  return scale > 1 ? Math.round(scale * 100) / 100 : null
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: 'POST', body: JSON.stringify(body) })
}

async function connect(code: string): Promise<void> {
  // De uma conexão anterior (ao girar o aparelho, por exemplo), o vídeo e o cursor velhos ficariam por cima do novo.
  for (const old of document.querySelectorAll('.motor-video, .motor-cursor, .motor-panel'))
    old.remove()
  button.disabled = true
  say('Conectando…')
  const opened = await post('/api/abrir', { codigo: code })
  const reply = (await opened.json().catch(() => ({}))) as { sessao?: string; erro?: string }
  if (!opened.ok || !reply.sessao) {
    button.disabled = false
    return say(reply.erro ?? 'Sem resposta do computador. Tente de novo.', true)
  }
  const session = reply.sessao
  const send = (message: Message): void =>
    void post(`/api/enviar?sessao=${session}`, message).catch(() => undefined)

  const identity = await loadIdentity()
  const device = deviceOf(navigator.userAgent)
  const size = screenWant()
  const hello: Hello = {
    t: 'hello',
    v: PROTOCOL_VERSION,
    id: identity.id,
    name: device.name,
    kind: device.kind,
    fp: identity.fp,
    screen: size
  }
  const want: Want = {
    t: 'want',
    ...size,
    fps: 60,
    bitrate: 20,
    codecs: videoMimes(RTCRtpReceiver.getCapabilities('video')?.codecs ?? []),
    ...(screenScale(size) ? { scale: screenScale(size) as number } : {}),
    cursor: true
  }

  let peer: Hello | null = null
  let ended = false
  live = {
    session,
    code,
    landscape: landscape(),
    // Girou o aparelho: sai sem derrubar a tela cheia e entra de novo, com a tela estendida do jeito novo.
    turn: () => {
      send({ t: 'bye', reason: 'user' })
      finish('Girando a tela…', false, true)
    }
  }
  const events = new EventSource(`/api/eventos?sessao=${session}`)
  const finish = (message: string, error = false, keepScreen = false): void => {
    if (ended) return
    ended = true
    if (live?.session === session) live = null
    events.close()
    side.stop()
    void post(`/api/fechar?sessao=${session}`, {}).catch(() => undefined)
    document.body.classList.remove('web-live')
    if (document.fullscreenElement && !keepScreen)
      void document.exitFullscreen().catch(() => undefined)
    start.hidden = false
    button.disabled = false
    say(message, error)
    button.focus()
  }

  const api: MotorApi = {
    config: async () => ({ role: 'receive', synthetic: false, testFrames: null, showStats: false }),
    signal: (message: MediaMessage) => send(message),
    report: (report) => {
      if (report.type === 'first-frame') {
        start.hidden = true
        document.body.classList.add('web-live')
      } else if (report.type === 'quit') {
        send({ t: 'bye', reason: 'user' })
        finish('Você saiu. Digite o código para voltar.')
      } else if (report.type === 'error') finish(report.message, true)
    },
    input: () => undefined,
    onMessage: () => () => undefined
  }
  const side = createReceiver(api, identity, { testFrames: null, showStats: false })

  events.addEventListener('fim', () => finish('O computador encerrou a conexão.'))
  events.addEventListener('error', () => {
    if (events.readyState === EventSource.CLOSED) finish('A conexão caiu.', true)
  })
  events.addEventListener('message', ({ data }) => {
    let message: Message
    try {
      message = JSON.parse(String(data)) as Message
    } catch {
      return
    }
    switch (message.t) {
      case 'hello':
        peer = message
        return say(`Aguardando ${message.name}…`)
      case 'pending':
        return say('Toque em Permitir no computador.')
      case 'accepted':
        say('Abrindo a tela…')
        send(want)
        return void side.start(want)
      case 'denied':
        return finish(DENIED[message.reason] ?? 'O computador recusou.', true)
      case 'ping':
        return send({ t: 'pong', at: message.at })
      case 'bye':
        return finish('O computador encerrou a conexão.')
      case 'offer':
        // A oferta precisa vir com o mesmo certificado que o computador anunciou no `hello`.
        if (!peer || sdpFingerprint(message.sdp) !== peer.fp) {
          send({ t: 'bye', reason: 'error' })
          return finish('Não deu para confirmar o computador. Tente de novo.', true)
        }
        return void side.deliver(message)
      case 'ice':
        return void side.deliver(message)
      default:
        return
    }
  })
  send(hello)
}

/** A sessão em andamento, para reconectar quando o aparelho gira. */
let live: { session: string; code: string; landscape: boolean; turn(): void } | null = null
let turning: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (turning) clearTimeout(turning)
  turning = setTimeout(() => {
    const current = live
    if (!current || current.landscape === landscape()) return
    current.turn()
    connect(current.code).catch(() => say('Sem resposta do computador. Tente de novo.', true))
  }, 700)
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const code = input.value.replace(/\D/g, '')
  if (code.length !== 4) return say('O código tem 4 números.', true)
  // Tela cheia precisa do toque da pessoa: pede agora, e a tela entra assim que o vídeo chega.
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  connect(code).catch(() => {
    button.disabled = false
    say('Sem resposta do computador. Tente de novo.', true)
  })
})

// Pelo QR code o código já vem no link: falta só o toque (a tela cheia precisa dele).
// iPhone no Safari: as barras dele não saem (o Safari não deixa a página ficar em tela cheia). Aberto pela Tela de
// Início, ele abre como app, sem barras.
const standalone =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches
if (/iPhone|iPod/.test(navigator.userAgent) && !standalone)
  $<HTMLParagraphElement>('dica').hidden = false

const fromLink = (/^\/(\d{4})$/.exec(location.pathname)?.[1] ?? location.hash).replace(/\D/g, '')
if (fromLink.length === 4) {
  input.value = fromLink
  say('Toque em Conectar.')
} else input.focus()
