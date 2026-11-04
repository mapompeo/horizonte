import type { MediaMessage, MotorApi, MotorStats } from '../../../shared/motor'
import type { Identity } from './identity'
import { createPeer, forwardIce, iceQueue, negotiateCaptureTime, type MotorSide } from './peer'
import { percentiles } from '../../../shared/percentiles'
import { summarize, type StatEntry } from './stats'
import { matchesTestColor } from './synthetic'
import { attachInputCapture } from './input-capture'
import { encodeInput, INPUT, INPUT_MOVES, type InputEvent } from '../../../shared/input'

interface FrameMetadata {
  captureTime?: number
  receiveTime?: number
  expectedDisplayTime: number
}

/** Lado que mostra, na janela de exibição. */
export function createReceiver(
  api: MotorApi,
  identity: Identity,
  options: { testFrames: number | null; showStats: boolean }
): MotorSide {
  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.className = 'motor-video'
  document.body.append(video)

  const panel = document.createElement('pre')
  panel.className = 'motor-panel'
  panel.hidden = !options.showStats
  document.body.append(panel)

  let pc: RTCPeerConnection | null = null
  let ice: ReturnType<typeof iceQueue> | null = null
  let statsTimer: ReturnType<typeof setInterval> | null = null
  let firstFrameSent = false
  const latencies: number[] = []
  let lastLatency: number | null = null
  let lastDisplay: number | null = null

  // Mouse, teclado e toque desta janela agem na tela estendida, pelos canais que quem envia abriu. Ficam de fora
  // Ctrl+Shift+D (mostra os números) e Esc segurado (sai).
  const channels = new Map<string, RTCDataChannel>()
  const sendInput = (event: InputEvent): void => {
    const channel = (event.t === 'move' && channels.get(INPUT_MOVES)) || channels.get(INPUT)
    if (channel?.readyState === 'open') channel.send(encodeInput(event))
  }
  if (options.testFrames === null)
    attachInputCapture({
      video,
      send: sendInput,
      onQuit: () => api.report({ type: 'quit' }),
      onLocalShortcut: (event) => {
        if (!(event.ctrlKey && event.shiftKey && event.code === 'KeyD')) return false
        if (event.type === 'keydown') panel.hidden = !panel.hidden
        return true
      }
    })

  function onFrame(_now: number, metadata: FrameMetadata): void {
    if (!firstFrameSent) {
      firstFrameSent = true
      api.report({ type: 'first-frame' })
    }
    // O captureTime de um vídeo do WebRTC já vem convertido para o relógio desta janela.
    if (metadata.captureTime !== undefined) {
      lastLatency = metadata.expectedDisplayTime - metadata.captureTime
      latencies.push(lastLatency)
      if (latencies.length > 600) latencies.shift()
    }
    // Do último pacote do quadro até a tela: decodificar e desenhar. Vem mesmo sem a hora da captura.
    if (metadata.receiveTime !== undefined)
      lastDisplay = metadata.expectedDisplayTime - metadata.receiveTime
    video.requestVideoFrameCallback(onFrame as VideoFrameRequestCallback)
  }

  let tested = false
  /**
   * Teste de ponta a ponta: confere a cor do bloco fixo do quadro de teste quando já foram decodificados `testFrames`
   * quadros. Conta pelos números do WebRTC, e não pelos quadros desenhados: janela encoberta não desenha vídeo.
   */
  function checkTestFrame(decoded: number): void {
    tested = true
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    ctx.drawImage(video, 0, 0)
    const [r, g, b] = ctx.getImageData(
      Math.floor(canvas.width * 0.2),
      Math.floor(canvas.height * 0.2),
      1,
      1
    ).data
    const ok = matchesTestColor({ r, g, b })
    api.report({
      type: 'test-result',
      ok,
      detail: `${decoded} quadros, ${canvas.width}x${canvas.height}, pixel rgb(${r}, ${g}, ${b})`
    })
  }

  function render(stats: MotorStats): void {
    const summary = percentiles(latencies)
    panel.textContent = [
      `${stats.width}x${stats.height}  ${stats.fps} fps  ${stats.mbps} Mbps`,
      `codec ${stats.codec || '?'} (${stats.implementation})`,
      `ida e volta ${stats.rttMs ?? '?'} ms  buffer ${stats.jitterBufferMs ?? '?'} ms`,
      `perdidos ${stats.packetsLost}  descartados ${stats.framesDropped}`,
      `recebido até a tela ${stats.displayMs ?? '?'} ms` +
        `  captura até a tela ${stats.latencyMs ?? '?'} ms` +
        (summary
          ? `  (mediana ${Math.round(summary.median)}, p95 ${Math.round(summary.p95)})`
          : ''),
      'Ctrl+Shift+D esconde · segure Esc para sair'
    ].join('\n')
  }

  function start(): void {
    stop()
    const send = (message: MediaMessage): void => api.signal(message)
    pc = createPeer(identity.certificate)
    ice = iceQueue(pc)
    forwardIce(pc, send)
    pc.addEventListener('connectionstatechange', () =>
      console.log('[motor] conexão:', pc?.connectionState)
    )
    pc.addEventListener('datachannel', ({ channel }) => {
      if (channel.label === INPUT || channel.label === INPUT_MOVES)
        channels.set(channel.label, channel)
    })
    pc.addEventListener('track', ({ track, receiver, streams }) => {
      // Sem buffer extra: na rede local, menos atraso vale mais que absorver variação.
      ;(receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = 0
      video.srcObject = streams[0] ?? new MediaStream([track])
      video.requestVideoFrameCallback(onFrame as VideoFrameRequestCallback)
    })

    let previous: StatEntry[] | null = null
    statsTimer = setInterval(async () => {
      if (!pc) return
      const current = [...(await pc.getStats()).values()] as StatEntry[]
      const stats = summarize(previous, current, { latencyMs: lastLatency, displayMs: lastDisplay })
      previous = current
      if (!stats) return
      if (options.testFrames !== null && !tested) {
        const inbound = current.find((e) => e.type === 'inbound-rtp' && e.kind === 'video')
        const decoded = Number(inbound?.framesDecoded ?? 0)
        if (decoded >= options.testFrames && video.videoWidth > 0) checkTestFrame(decoded)
      }
      render(stats)
      api.report({ type: 'stats', stats })
    }, 1000)
  }

  async function deliver(message: MediaMessage): Promise<void> {
    if (!pc || !ice) return
    if (message.t === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      for (const transceiver of pc.getTransceivers()) negotiateCaptureTime(transceiver)
      await ice.flush()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      api.signal({ t: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' })
    } else if (message.t === 'ice') await ice.add(message)
  }

  function stop(): void {
    if (statsTimer) clearInterval(statsTimer)
    statsTimer = null
    pc?.close()
    pc = ice = null
    channels.clear()
    video.srcObject = null
  }

  return { start, deliver, stop }
}
