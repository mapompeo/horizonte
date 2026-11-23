import type { Want } from '../../../main/engine/webrtc/protocol'
import type { MediaMessage } from '../../../shared/motor'
import { parameterSetsFirst } from './h264'

/** Um lado da sessão dentro da janela: o que envia ou o que mostra. */
export interface MotorSide {
  start(want: Want, frames?: string): Promise<void> | void
  deliver(message: MediaMessage): Promise<void>
  stop(): void
}

/**
 * Nada sai da rede local: sem STUN nem TURN. `sending` liga o acesso aos quadros codificados (ver `fixKeyFrames`), o
 * que obriga a passar todo vídeo enviado por ele.
 */
export function createPeer(certificate: RTCCertificate, sending = false): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: [],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    certificates: [certificate],
    ...(sending ? { encodedInsertableStreams: true } : {})
  } as RTCConfiguration)
}

type EncodedSender = RTCRtpSender & {
  createEncodedStreams(): { readable: ReadableStream; writable: WritableStream }
}

/**
 * Passa cada quadro codificado antes de ele sair: nos quadros-chave H.264, põe os parâmetros (SPS e PPS) antes da
 * imagem. A VA-API da Mesa numa Radeon RX 580 entrega a imagem primeiro, e quem recebe nunca conseguia começar a
 * decodificar. Nos outros quadros e codecs, nada muda.
 */
export function fixKeyFrames(sender: RTCRtpSender): void {
  const { readable, writable } = (sender as EncodedSender).createEncodedStreams()
  const transform = new TransformStream<RTCEncodedVideoFrame, RTCEncodedVideoFrame>({
    transform(frame, controller) {
      if (frame.type === 'key') {
        const mime = (frame.getMetadata() as { mimeType?: string }).mimeType
        if (!mime || /h264/i.test(mime)) {
          const fixed = parameterSetsFirst(new Uint8Array(frame.data))
          if (fixed) frame.data = fixed.buffer as ArrayBuffer
        }
      }
      controller.enqueue(frame)
    }
  })
  readable
    .pipeThrough(transform)
    .pipeTo(writable)
    .catch((error: unknown) => {
      console.warn('[motor] quadros codificados:', error)
    })
}

/**
 * Candidatos podem chegar antes da descrição remota (a sinalização é mais rápida que o `setRemoteDescription`):
 * guarda e aplica depois.
 */
export function iceQueue(pc: RTCPeerConnection): {
  add(message: Extract<MediaMessage, { t: 'ice' }>): Promise<void>
  flush(): Promise<void>
} {
  const waiting: RTCIceCandidateInit[] = []
  const apply = (init: RTCIceCandidateInit): Promise<void> =>
    pc.addIceCandidate(init.candidate ? init : undefined).catch((error) => {
      console.warn('[motor] candidato recusado', error)
    })
  return {
    async add({ candidate, sdpMid, sdpMLineIndex }) {
      const init = { candidate, sdpMid, sdpMLineIndex }
      if (pc.remoteDescription) await apply(init)
      else waiting.push(init)
    },
    async flush() {
      for (const init of waiting.splice(0)) await apply(init)
    }
  }
}

/** Manda cada candidato local ao outro lado. */
export function forwardIce(pc: RTCPeerConnection, send: (message: MediaMessage) => void): void {
  pc.addEventListener('icecandidate', ({ candidate }) => {
    send(
      candidate
        ? {
            t: 'ice',
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
          }
        : { t: 'ice', candidate: '', sdpMid: null, sdpMLineIndex: null }
    )
  })
}

const ABS_CAPTURE_TIME = 'http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time'

interface HeaderExtension {
  uri: string
  direction: RTCRtpTransceiverDirection | 'stopped'
}
type WithExtensions = RTCRtpTransceiver & {
  getHeaderExtensionsToNegotiate?(): HeaderExtension[]
  setHeaderExtensionsToNegotiate?(extensions: HeaderExtension[]): void
}

/**
 * Liga a extensão que leva a hora da captura junto de cada quadro. Sem ela, o `captureTime` do
 * `requestVideoFrameCallback` não vem e não dá para medir o atraso. Precisa ser feito nas duas pontas, antes da
 * oferta (quem envia) e antes da resposta (quem mostra).
 */
export function negotiateCaptureTime(transceiver: RTCRtpTransceiver): void {
  const t = transceiver as WithExtensions
  const extensions = t.getHeaderExtensionsToNegotiate?.()
  if (!extensions || !t.setHeaderExtensionsToNegotiate) return
  const extension = extensions.find((e) => e.uri === ABS_CAPTURE_TIME)
  if (!extension) return
  extension.direction = 'sendrecv'
  try {
    t.setHeaderExtensionsToNegotiate(extensions)
  } catch (error) {
    console.warn('[motor] não consegui ligar a hora da captura', error)
  }
}
