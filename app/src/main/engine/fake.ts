import type { Host, PrepStep } from '../../shared/types'
import type { EnginePort } from './port'

type Callback<A extends unknown[]> = (...args: A) => void

function emitter<A extends unknown[]>(): {
  on(callback: Callback<A>): () => void
  emit(...args: A): void
} {
  const subscribers = new Set<Callback<A>>()
  return {
    on(callback) {
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
    emit(...args) {
      for (const callback of [...subscribers]) callback(...args)
    }
  }
}

/** Motor de mentira: simula o fluxo para desenvolver a interface e testar o núcleo. */
export class FakeEngine implements EnginePort {
  calls: string[] = []
  failPrepare: string | null = null
  failConnect: string | null = null
  hosts: Host[] = [{ name: 'Desktop', address: '192.168.1.3' }]

  private pair = emitter<[string]>()
  private connected = emitter<[string]>()
  private disconnected = emitter<[]>()
  private ended = emitter<[]>()

  constructor(private readonly delayMs = 0) {}

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs))
  }

  async prepare(onStep: (step: PrepStep) => void): Promise<void> {
    this.calls.push('prepare')
    for (const step of ['engine', 'display', 'encoder'] as const) {
      onStep(step)
      await this.wait()
    }
    if (this.failPrepare) {
      const message = this.failPrepare
      this.failPrepare = null
      throw new Error(message)
    }
  }

  async approve(): Promise<void> {
    this.calls.push('approve')
  }

  async deny(): Promise<void> {
    this.calls.push('deny')
  }

  async stopSending(): Promise<void> {
    this.calls.push('stopSending')
  }

  async listHosts(): Promise<Host[]> {
    return this.hosts
  }

  async connect(host: string): Promise<void> {
    this.calls.push(`connect:${host}`)
    await this.wait()
    if (this.failConnect) {
      const message = this.failConnect
      this.failConnect = null
      throw new Error(message)
    }
  }

  async disconnect(): Promise<void> {
    this.calls.push('disconnect')
  }

  async applyBitrate(mbps: number): Promise<void> {
    this.calls.push(`bitrate:${mbps}`)
  }

  onPairRequest(callback: (device: string) => void): () => void {
    return this.pair.on(callback)
  }

  onClientConnected(callback: (device: string) => void): () => void {
    return this.connected.on(callback)
  }

  onClientDisconnected(callback: () => void): () => void {
    return this.disconnected.on(callback)
  }

  onStreamEnded(callback: () => void): () => void {
    return this.ended.on(callback)
  }

  simulatePairRequest(device: string): void {
    this.pair.emit(device)
  }

  simulateClientConnected(device: string): void {
    this.connected.emit(device)
  }

  simulateClientDisconnected(): void {
    this.disconnected.emit()
  }

  simulateStreamEnded(): void {
    this.ended.emit()
  }
}
