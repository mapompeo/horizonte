import type { MotorApi, MotorFramesApi } from '../../../shared/motor'

declare global {
  interface Window {
    motor: MotorApi
    /** Só na janela de envio. */
    motorFrames?: MotorFramesApi
  }

  /** Trilha de vídeo alimentada por quadros (Chromium; ainda fora dos tipos do TypeScript). */
  class MediaStreamTrackGenerator extends MediaStreamTrack {
    constructor(init: { kind: 'video' | 'audio' })
    readonly writable: WritableStream<VideoFrame>
  }
}
