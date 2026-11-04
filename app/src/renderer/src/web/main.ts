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
  user: 'O computador não permitiu a conexão.',
  busy: 'O computador já está mostrando a tela em outro lugar.',
  version:
    'Esta página e o Horizonte do computador estão em versões diferentes. Recarregue a página.'
}

function say(message: string, error = false): void {
  text.textContent = message
  text.classList.toggle('web-error', error)
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

/** Tamanho da tela deste aparelho em pixels de verdade, par e dentro do que o protocolo aceita. */
function screenWant(): { width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const even = (value: number, max: number): number =>
    Math.max(160, Math.min(max, Math.round((value * ratio) / 2) * 2))
  const landscape = window.screen.width >= window.screen.height
  const [w, h] = landscape
    ? [window.screen.width, window.screen.height]
    : [window.screen.height, window.screen.width]
  return { width: even(w, 3840), height: even(h, 2160) }
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: 'POST', body: JSON.stringify(body) })
}

async function connect(code: string): Promise<void> {
  button.disabled = true
  say('Conectando…')
  const opened = await post('/api/abrir', { codigo: code })
  const reply = (await opened.json().catch(() => ({}))) as { sessao?: string; erro?: string }
  if (!opened.ok || !reply.sessao) {
    button.disabled = false
    return say(reply.erro ?? 'Não consegui falar com o computador.', true)
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
    codecs: videoMimes(RTCRtpReceiver.getCapabilities('video')?.codecs ?? [])
  }

  let peer: Hello | null = null
  let ended = false
  const events = new EventSource(`/api/eventos?sessao=${session}`)
  const finish = (message: string, error = false): void => {
    if (ended) return
    ended = true
    events.close()
    side.stop()
    void post(`/api/fechar?sessao=${session}`, {}).catch(() => undefined)
    document.body.classList.remove('web-live')
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    start.hidden = false
    button.disabled = false
    say(message, error)
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
        return say(`Pedindo para ver a tela de ${message.name}…`)
      case 'pending':
        return say(`No computador, toque em Permitir.`)
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
          return finish('O certificado do computador não confere. Conexão encerrada.', true)
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

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const code = input.value.replace(/\D/g, '')
  if (code.length !== 6) return say('O código tem 6 números.', true)
  // Tela cheia precisa do toque da pessoa: pede agora, e a tela entra assim que o vídeo chega.
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  connect(code).catch(() => {
    button.disabled = false
    say('Não consegui falar com o computador.', true)
  })
})

const fromLink = location.hash.replace(/\D/g, '')
if (fromLink.length === 6) input.value = fromLink
input.focus()
