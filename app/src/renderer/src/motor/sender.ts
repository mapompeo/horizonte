import type { Want } from '../../../main/engine/webrtc/protocol'
import type { MediaMessage, MotorApi } from '../../../shared/motor'
import { BASE_ORDER, orderCodecList, rankCodecs, type CodecProbe } from './codecs'
import type { Identity } from './identity'
import { createPeer, forwardIce, iceQueue, negotiateCaptureTime, type MotorSide } from './peer'
import { summarize, type StatEntry } from './stats'
import { syntheticStream } from './synthetic'

/** A sessão começa abaixo do bitrate pedido e sobe em poucos segundos: evita uma rajada logo no começo. */
const START_FRACTION = 0.6
const RAMP_MS = 3000

/** Pergunta ao navegador quais codecs ele codifica, e quais pela placa de vídeo. */
async function probeCodecs(want: Want): Promise<CodecProbe[]> {
  return Promise.all(
    BASE_ORDER.map(async (mime) => {
      try {
        const info = await navigator.mediaCapabilities.encodingInfo({
          type: 'webrtc',
          video: {
            contentType: mime,
            width: want.width,
            height: want.height,
            bitrate: want.bitrate * 1e6,
            framerate: want.fps
          }
        })
        return { mime, supported: info.supported, powerEfficient: info.powerEfficient }
      } catch {
        return { mime, supported: false, powerEfficient: false }
      }
    })
  )
}

/**
 * Vídeo feito das imagens que o auxiliar do Linux manda (a tela estendida do GNOME), sem passar pelo portal de captura
 * e o seletor dele. Se uma imagem chega enquanto a anterior ainda está sendo entregue, ela é descartada.
 */
function framesStream(
  path: string,
  onClose: (reason: string) => void
): { stream: MediaStream; stop(): void } {
  const frames = window.motorFrames
  if (!frames) throw new Error('Esta janela não lê as imagens da tela estendida.')
  const generator = new MediaStreamTrackGenerator({ kind: 'video' })
  const writer = generator.writable.getWriter()
  let busy = false
  const stop = frames.open(
    path,
    (raw) => {
      if (busy) return
      busy = true
      const frame = new VideoFrame(raw.data, {
        format: raw.format,
        codedWidth: raw.width,
        codedHeight: raw.height,
        layout: [{ offset: 0, stride: raw.stride }],
        timestamp: Math.round(performance.now() * 1000)
      })
      writer
        .write(frame)
        .catch(() => undefined)
        .finally(() => {
          frame.close()
          busy = false
        })
    },
    onClose
  )
  return { stream: new MediaStream([generator]), stop }
}

async function capture(want: Want, synthetic: boolean): Promise<MediaStream> {
  if (synthetic)
    return syntheticStream(Math.min(want.width, 1280), Math.min(want.height, 720), want.fps)
  // O processo principal escolhe a tela (setDisplayMediaRequestHandler): aqui não aparece seletor.
  return navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: {
      width: { max: want.width },
      height: { max: want.height },
      frameRate: { ideal: want.fps, max: want.fps }
    }
  })
}

/** Lado que envia, dentro da janela de transmissão (oculta). */
export function createSender(api: MotorApi, identity: Identity, synthetic: boolean): MotorSide {
  let pc: RTCPeerConnection | null = null
  let stream: MediaStream | null = null
  let sender: RTCRtpSender | null = null
  let ice: ReturnType<typeof iceQueue> | null = null
  let statsTimer: ReturnType<typeof setInterval> | null = null
  let rampTimer: ReturnType<typeof setInterval> | null = null
  let targetMbps = 0
  let stopFrames: (() => void) | null = null

  async function setBitrate(mbps: number, fps?: number): Promise<void> {
    if (!sender) return
    const params = sender.getParameters()
    if (!params.encodings?.length) params.encodings = [{}]
    params.encodings[0].maxBitrate = Math.round(mbps * 1e6)
    if (fps) params.encodings[0].maxFramerate = fps
    params.encodings[0].scaleResolutionDownBy = 1
    // Texto nítido vale mais que quadros num monitor de trabalho.
    ;(params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
      'maintain-resolution'
    try {
      await sender.setParameters(params)
    } catch {
      delete (params as { degradationPreference?: string }).degradationPreference
      await sender.setParameters(params).catch(() => undefined)
    }
  }

  async function start(want: Want, frames?: string): Promise<void> {
    stop()
    const send = (message: MediaMessage): void => api.signal(message)
    pc = createPeer(identity.certificate)
    ice = iceQueue(pc)
    forwardIce(pc, send)
    pc.addEventListener('connectionstatechange', () =>
      console.log('[motor] conexão:', pc?.connectionState)
    )

    if (frames) {
      const source = framesStream(frames, (reason) =>
        console.warn('[motor] imagens da tela:', reason)
      )
      stream = source.stream
      stopFrames = source.stop
    } else stream = await capture(want, synthetic)
    const [track] = stream.getVideoTracks()
    track.contentHint = 'detail'
    const transceiver = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
    sender = transceiver.sender
    negotiateCaptureTime(transceiver)

    const ranked = rankCodecs(await probeCodecs(want), want.codecs)
    const capabilities = RTCRtpSender.getCapabilities('video')?.codecs ?? []
    const ordered = orderCodecList(capabilities, ranked)
    if (ranked.length > 0) transceiver.setCodecPreferences(ordered)
    console.log('[motor] ordem dos codecs:', ranked.join(', ') || 'padrão do navegador')

    pc.createDataChannel('controle')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    send({ t: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' })

    targetMbps = want.bitrate
    await setBitrate(targetMbps * START_FRACTION, want.fps)
    const began = Date.now()
    rampTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - began) / RAMP_MS)
      const fraction = START_FRACTION + (1 - START_FRACTION) * progress
      void setBitrate(targetMbps * fraction)
      if (progress >= 1 && rampTimer) clearInterval(rampTimer)
    }, 500)

    let previous: StatEntry[] | null = null
    statsTimer = setInterval(async () => {
      if (!pc) return
      const current = [...(await pc.getStats()).values()] as StatEntry[]
      const stats = summarize(previous, current)
      previous = current
      if (stats) api.report({ type: 'stats', stats })
    }, 1000)
  }

  async function deliver(message: MediaMessage): Promise<void> {
    if (!pc || !ice) return
    if (message.t === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      await ice.flush()
    } else if (message.t === 'ice') await ice.add(message)
    else if (message.t === 'bitrate') {
      targetMbps = message.mbps
      await setBitrate(message.mbps)
    }
  }

  function stop(): void {
    if (statsTimer) clearInterval(statsTimer)
    if (rampTimer) clearInterval(rampTimer)
    statsTimer = rampTimer = null
    stopFrames?.()
    stopFrames = null
    for (const track of stream?.getTracks() ?? []) track.stop()
    pc?.close()
    pc = stream = sender = ice = null
  }

  return { start, deliver, stop }
}
