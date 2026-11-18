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
/** Até 3x: o iPhone e boa parte dos Android têm 3 pixels por ponto, e com 2x a imagem chegava borrada. */
const MAX_RATIO = 3
function screenWant(): { width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO)
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
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO)
  // O lado menor: deitado é a altura, em pé é a largura.
  const scale = Math.max(1, Math.min(ratio, Math.min(size.width, size.height) / MIN_POINTS))
  return scale > 1 ? Math.round(scale * 100) / 100 : null
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: 'POST', body: JSON.stringify(body) })
}

async function connect(): Promise<void> {
  // De uma conexão anterior (ao girar o aparelho, por exemplo), o vídeo e o cursor velhos ficariam por cima do novo.
  for (const old of document.querySelectorAll('.motor-video, .motor-cursor, .motor-panel'))
    old.remove()
  button.disabled = true
  say('Conectando…')
  const opened = await post('/api/abrir', {})
  const reply = (await opened.json().catch(() => ({}))) as { sessao?: string; erro?: string }
  if (!opened.ok || !reply.sessao) {
    if (retries) throw new Error(reply.erro)
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
  let slow: ReturnType<typeof setTimeout> | undefined
  live = {
    session,
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
    clearTimeout(slow)
    if (live?.session === session) live = null
    events.close()
    side.stop()
    void post(`/api/fechar?sessao=${session}`, {}).catch(() => undefined)
    document.body.classList.remove('web-live')
    void awake?.release().catch(() => undefined)
    awake = null
    if (document.fullscreenElement && !keepScreen)
      void document.exitFullscreen().catch(() => undefined)
    start.hidden = false
    button.disabled = false
    say(message, error)
    button.focus()
  }

  /** Caiu sem ninguém pedir (Wi-Fi, computador dormiu): fica na tela cheia e tenta de novo sozinho. */
  const lost = (message: string): void => {
    if (ended) return
    finish('Reconectando…', false, true)
    reconnect(message)
  }

  const api: MotorApi = {
    config: async () => ({ role: 'receive', synthetic: false, testFrames: null, showStats: false }),
    signal: (message: MediaMessage) => send(message),
    report: (report) => {
      if (report.type === 'first-frame') {
        clearTimeout(slow)
        retries = 0
        start.hidden = true
        document.body.classList.add('web-live')
        void stayAwake()
      } else if (report.type === 'quit') {
        send({ t: 'bye', reason: 'user' })
        finish('Você saiu. Toque em Conectar para voltar.')
      } else if (report.type === 'error') lost(report.message)
    },
    input: () => undefined,
    onMessage: () => () => undefined
  }
  const side = createReceiver(api, identity, { testFrames: null, showStats: false })

  events.addEventListener('fim', () => finish('O computador encerrou a conexão.'))
  events.addEventListener('error', () => {
    if (events.readyState === EventSource.CLOSED) lost('A conexão caiu.')
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
        // Na primeira vez, o computador instala o monitor virtual e pede uma permissão: daqui não dá para ver isso.
        slow = setTimeout(
          () => say('Abrindo a tela… Se o computador pedir uma permissão, confirme lá.'),
          SLOW_START_MS
        )
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

/** Sem imagem depois disto, o aviso de olhar o computador (lá pode haver um pedido de permissão). */
const SLOW_START_MS = 5000

/** Esperas entre as tentativas de reconectar; acabou a lista, mostra o erro e volta o botão. */
const RETRY_MS = [1000, 2000, 4000, 8000, 8000]
let retries = 0
function reconnect(message: string): void {
  const delay = RETRY_MS[retries++]
  if (delay === undefined) {
    retries = 0
    button.disabled = false
    return say(message, true)
  }
  button.disabled = true
  say('Reconectando…')
  setTimeout(() => void connect().catch(() => reconnect(message)), delay)
}

/**
 * Tela acesa enquanto a imagem chega. A Wake Lock só existe em endereço seguro (https), e a página é http na rede de
 * casa: lá quem segura a tela é o próprio vídeo tocando. Volta a pedir quando a página volta a aparecer.
 */
let awake: WakeLockSentinel | null = null
async function stayAwake(): Promise<void> {
  awake = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.classList.contains('web-live'))
    void stayAwake()
})

/** A sessão em andamento, para reconectar quando o aparelho gira. */
let live: { session: string; landscape: boolean; turn(): void } | null = null
let turning: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (turning) clearTimeout(turning)
  turning = setTimeout(() => {
    const current = live
    if (!current || current.landscape === landscape()) return
    current.turn()
    connect().catch(() => say('Sem resposta do computador. Tente de novo.', true))
  }, 700)
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  retries = 0
  // Tela cheia precisa do toque da pessoa: pede agora, e a tela entra assim que o vídeo chega.
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  connect().catch(() => {
    button.disabled = false
    say('Sem resposta do computador. Tente de novo.', true)
  })
})

// Falta só o toque: a tela cheia precisa dele.
// iPhone no Safari: as barras dele não saem (o Safari não deixa a página ficar em tela cheia). Aberto pela Tela de
// Início, ele abre como app, sem barras.
const standalone =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches
if (/iPhone|iPod/.test(navigator.userAgent) && !standalone)
  $<HTMLParagraphElement>('dica').hidden = false
button.focus()
