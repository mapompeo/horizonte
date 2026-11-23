import type { MotorApi, MotorFramesApi } from '../../../shared/motor'

declare global {
  interface Window {
    motor: MotorApi
    /** Só na janela de envio. */
    motorFrames?: MotorFramesApi
  }

  /** Lê os quadros de uma trilha de vídeo (Chromium; ainda fora dos tipos do TypeScript). */
  class MediaStreamTrackProcessor {
    constructor(init: { track: MediaStreamTrack })
    readonly readable: ReadableStream<VideoFrame>
  }

  /** Trilha de vídeo alimentada por quadros (Chromium; ainda fora dos tipos do TypeScript). */
  class MediaStreamTrackGenerator extends MediaStreamTrack {
    constructor(init: { kind: 'video' | 'audio' })
    readonly writable: WritableStream<VideoFrame>
  }
}
