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
  spawn(args: string[]): Promise<MoonlightProcess>
  listHosts(): Promise<Host[]>
  /** Roda o Moonlight até ele terminar e devolve o código de saída (usado no pareamento). */
  run(args: string[]): Promise<number | null>
  /** Manda o PIN ao dispositivo que envia, pelo canal do Horizonte. */
  sendPin(host: string, device: string, pin: string): Promise<void>
  /** Nome que este aparelho usa ao parear: é o que o outro lado mostra em "Permitir...?". */
  deviceName(): string
  randomPin(): string
  /**
   * Aparelhos já pareados, lembrados entre aberturas do app. Sem isso rodaríamos o `pair` de novo e o
   * Moonlight abriria o aviso "já se encontra pareado", que trava a transmissão até alguém clicar OK.
   */
  pairedHosts?: { load(): Promise<string[]>; save(hosts: string[]): Promise<void> }
  now?: () => number
}

/** Transmissão que cai com erro antes disso quase sempre é pareamento perdido, não queda de rede. */
const EARLY_FAILURE_MS = 15_000

export function createMoonlightClient(deps: MoonlightClientDeps): ClientEngine {
  let current: MoonlightProcess | null = null
  const ended = new Set<() => void>()
  const paired = new Set<string>()
  const now = deps.now ?? Date.now
  let loaded: Promise<void> | null = null
  const remember = (): Promise<void> | undefined => deps.pairedHosts?.save([...paired])
  const load = (): Promise<void> =>
    (loaded ??= (async () => {
      for (const host of (await deps.pairedHosts?.load().catch(() => [])) ?? []) paired.add(host)
    })())

  return {
    listHosts: () => deps.listHosts(),
    async connect(host, settings) {
      if (current) throw new Error('Já existe uma transmissão sendo recebida.')
      await load()
      if (!paired.has(host)) {
        // Sem PIN digitado: este aparelho gera o PIN, manda pelo canal e o outro só precisa aprovar.
        const pin = deps.randomPin()
        await deps.sendPin(host, deps.deviceName(), pin).catch(() => {
          throw new Error(
            'Não consegui falar com o outro dispositivo. Confira se o Horizonte está aberto em Enviar lá.'
          )
        })
        if ((await deps.run(['pair', host, '--pin', pin])) !== 0) {
          throw new Error(
            'O pareamento não foi concluído. Aprove o pedido no outro dispositivo e tente de novo.'
          )
        }
        paired.add(host)
        await remember()
      }
      const child = await deps.spawn(buildStreamArgs(host, settings))
      const startedAt = now()
      current = child
      child.onExit((code) => {
        if (current !== child) return // foi o próprio disconnect
        if (code !== 0 && now() - startedAt < EARLY_FAILURE_MS && paired.delete(host)) {
          void remember()
        }
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
