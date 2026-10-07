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
  sleep?: (ms: number) => Promise<void>
}

/** Transmissão que cai com erro antes disso quase sempre é pareamento perdido, não queda de rede. */
const EARLY_FAILURE_MS = 15_000

export function createMoonlightClient(deps: MoonlightClientDeps): ClientEngine {
  let current: MoonlightProcess | null = null
  let generation = 0
  let connecting: number | null = null
  let retries = 0
  const sleep =
    deps.sleep ?? ((ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)))
  const ended = new Set<() => void>()
  const paired = new Set<string>()
  const now = deps.now ?? Date.now
  let loaded: Promise<void> | null = null
  const remember = (): Promise<void> | undefined => deps.pairedHosts?.save([...paired])
  const load = (): Promise<void> =>
    (loaded ??= (async () => {
      for (const host of (await deps.pairedHosts?.load().catch(() => [])) ?? []) paired.add(host)
    })())

  const client: ClientEngine = {
    listHosts: () => deps.listHosts(),
    async connect(host, settings) {
      if (current || connecting !== null)
        throw new Error('Já existe uma transmissão sendo recebida.')
      const run = ++generation
      connecting = run
      const cancelled = (): boolean => run !== generation
      try {
        await load()
        if (cancelled()) return
        if (!paired.has(host)) {
          // Sem PIN digitado: este aparelho gera o PIN, manda pelo canal e o outro só precisa aprovar.
          const pin = deps.randomPin()
          await deps.sendPin(host, deps.deviceName(), pin).catch(() => {
            throw new Error(
              'Não consegui falar com o outro dispositivo. Confira se o Horizonte está aberto em Enviar lá.'
            )
          })
          if (cancelled()) return
          // O Moonlight às vezes registra o pareamento e não encerra o processo (visto no Mac e no Linux):
          // se o pair não deu 0, o `list` diz se o aparelho ficou pareado mesmo assim.
          const pairCode = await deps.run(['pair', host, '--pin', pin])
          if (cancelled()) return
          if (pairCode !== 0 && (await deps.run(['list', host])) !== 0) {
            throw new Error(
              'O pareamento não foi concluído. Aprove o pedido no outro dispositivo e tente de novo.'
            )
          }
          paired.add(host)
          await remember()
        }
        if (cancelled()) return
        const child = await deps.spawn(buildStreamArgs(host, settings))
        if (cancelled()) {
          child.kill()
          return
        }
        const startedAt = now()
        current = child
        child.onExit((code) => {
          if (current !== child) return // foi o próprio disconnect
          const duration = now() - startedAt
          if (code !== 0 && duration < EARLY_FAILURE_MS && paired.delete(host)) {
            void remember()
          }
          current = null
          if (duration >= 60_000) retries = 0
          if (code !== 0 && duration >= EARLY_FAILURE_MS && retries < 3) {
            const token = generation
            retries++
            void sleep(1000 * 2 ** (retries - 1))
              .then(async () => {
                if (token !== generation) return
                try {
                  await client.connect(host, settings)
                } catch {
                  if (generation === token + 1) ended.forEach((listener) => listener())
                }
              })
              .catch(() => {
                if (token === generation) ended.forEach((listener) => listener())
              })
            return
          }
          ended.forEach((listener) => listener())
        })
      } finally {
        if (connecting === run) connecting = null
      }
    },
    async disconnect() {
      generation++
      connecting = null
      retries = 0
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
  return client
}
