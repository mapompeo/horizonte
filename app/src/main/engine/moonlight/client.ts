import type { Codec, Host, Resolution, Settings } from '../../../shared/types'
import type { ClientEngine } from '../port'

const SIZE: Record<Resolution, string> = {
  '720p': '1280x720',
  '1080p': '1920x1080',
  '1440p': '2560x1440'
}

const CODEC: Record<Codec, string> = { h264: 'H.264', hevc: 'HEVC', av1: 'AV1' }

/** Linha de comando do `Moonlight.exe stream`: o Moonlight Qt aceita tudo isso por parâmetro. */
export function buildStreamArgs(host: string, settings: Settings): string[] {
  return [
    'stream',
    host,
    'Desktop',
    '--resolution',
    SIZE[settings.resolution],
    '--fps',
    String(settings.fps),
    '--bitrate',
    String(Math.round(settings.bitrate * 1000)), // o Moonlight conta em kbps
    '--video-codec',
    CODEC[settings.codec],
    '--display-mode',
    'borderless',
    '--quit-after'
  ]
}

/** O pedaço do processo filho que importa; `child_process.spawn` de verdade entra em `index.ts`. */
export interface MoonlightProcess {
  kill(): void
  onExit(listener: (code: number | null) => void): void
}

export interface MoonlightClientDeps {
  spawn(args: string[]): MoonlightProcess
  listHosts(): Promise<Host[]>
}

export function createMoonlightClient(deps: MoonlightClientDeps): ClientEngine {
  let current: MoonlightProcess | null = null
  const ended = new Set<() => void>()

  return {
    listHosts: () => deps.listHosts(),
    async connect(host, settings) {
      if (current) throw new Error('Já existe uma transmissão sendo recebida.')
      const child = deps.spawn(buildStreamArgs(host, settings))
      current = child
      child.onExit(() => {
        if (current !== child) return // foi o próprio disconnect
        current = null
        ended.forEach((listener) => listener())
      })
    },
    async disconnect() {
      const child = current
      current = null
      child?.kill()
    },
    // O Moonlight só lê o bitrate ao iniciar: o valor novo vale na próxima conexão.
    applyBitrate: async () => undefined,
    onStreamEnded(callback) {
      ended.add(callback)
      return () => ended.delete(callback)
    }
  }
}
