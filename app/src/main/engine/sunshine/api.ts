import https from 'node:https'
import type { IncomingMessage } from 'node:http'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])
const MAX_BODY_BYTES = 1_000_000

export type SunshineApiErrorKind =
  'unreachable' | 'unauthorized' | 'server' | 'timeout' | 'invalid-response'

export class SunshineApiError extends Error {
  constructor(
    readonly kind: SunshineApiErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'SunshineApiError'
  }
}

export interface Pairing {
  id: string
  name: string
  address: string
}

const READ_ONLY_KEYS = ['platform', 'status', 'version'] as const

export interface SunshineApiOptions {
  /** Porta base do Sunshine (47989 por padrão). A API fica em porta + 1. */
  port: number
  username: string
  password: string
  host?: string
  timeoutMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class SunshineApi {
  private readonly agent = new https.Agent({ rejectUnauthorized: false })
  private readonly host: string
  private readonly webPort: number
  private readonly authorization: string
  private configWrites: Promise<void> = Promise.resolve()
  private readonly timeoutMs: number

  constructor(options: SunshineApiOptions) {
    const host = options.host ?? '127.0.0.1'
    if (!LOOPBACK.has(host)) {
      throw new Error('A API do motor de transmissão só pode ser acessada no próprio computador.')
    }
    this.host = host
    this.webPort = options.port + 1
    this.timeoutMs = options.timeoutMs ?? 5000
    this.authorization =
      'Basic ' + Buffer.from(`${options.username}:${options.password}`).toString('base64')
  }

  async listPairings(): Promise<Pairing[]> {
    const data = await this.request('GET', '/api/pin')
    if (!isRecord(data) || !Array.isArray(data.pairings)) {
      throw new SunshineApiError(
        'invalid-response',
        'O motor de transmissão mandou uma lista de pareamentos inesperada.'
      )
    }
    return data.pairings.flatMap((item: unknown): Pairing[] => {
      if (!isRecord(item)) return []
      if (typeof item.id !== 'string' && typeof item.id !== 'number') return []
      return [
        {
          id: String(item.id),
          name: typeof item.name === 'string' ? item.name : '',
          address: typeof item.address === 'string' ? item.address : ''
        }
      ]
    })
  }

  /** Nomes dos aparelhos que já foram pareados com este Sunshine. */
  async listClientNames(): Promise<string[]> {
    const data = await this.request('GET', '/api/clients/list')
    if (!isRecord(data) || !Array.isArray(data.named_certs)) {
      throw new SunshineApiError(
        'invalid-response',
        'O motor de transmissão mandou uma lista de aparelhos pareados inesperada.'
      )
    }
    return data.named_certs.flatMap((item: unknown): string[] =>
      isRecord(item) && typeof item.name === 'string' && item.name !== '' ? [item.name] : []
    )
  }

  async submitPin(request: { pairingId: string; pin: string; name: string }): Promise<boolean> {
    const data = await this.request('POST', '/api/pin', {
      pairing_id: request.pairingId,
      pin: request.pin,
      name: request.name
    })
    return isRecord(data) && data.status === true
  }

  async cancelPairing(pairingId: string): Promise<void> {
    await this.request('DELETE', '/api/pin', { pairing_id: pairingId })
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const data = await this.request('GET', '/api/config')
    if (!isRecord(data)) {
      throw new SunshineApiError(
        'invalid-response',
        'O motor de transmissão mandou uma configuração inesperada.'
      )
    }
    // O Sunshine anexa metadados à leitura (confirmado na instância real); não são configuração.
    const config = { ...data }
    for (const key of READ_ONLY_KEYS) delete config[key]
    return config
  }

  /**
   * O Sunshine pode tratar o corpo como a configuração inteira. Por isso lemos tudo,
   * mesclamos o trecho novo por cima e gravamos o conjunto, sem nunca apagar o resto.
   */
  async saveConfig(patch: Record<string, string>, alive = (): boolean => true): Promise<void> {
    const write = this.configWrites.then(async () => {
      if (!alive()) return
      const current = await this.getConfig()
      if (!alive()) return
      await this.request('POST', '/api/config', { ...current, ...patch })
    })
    this.configWrites = write.catch(() => undefined)
    await write
  }

  /** O reinício derruba a própria conexão; isso não é falha. */
  async restart(): Promise<void> {
    try {
      await this.request('POST', '/api/restart', {})
    } catch (cause) {
      if (
        cause instanceof SunshineApiError &&
        (cause.kind === 'unreachable' || cause.kind === 'timeout')
      ) {
        return
      }
      throw cause
    }
  }

  async closeApp(): Promise<void> {
    await this.request('POST', '/api/apps/close', {})
  }

  private request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body)
      const request = https.request(
        {
          host: this.host,
          port: this.webPort,
          path,
          method,
          agent: this.agent,
          headers: {
            Authorization: this.authorization,
            ...(payload === undefined
              ? {}
              : {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload)
                })
          }
        },
        (response) => this.collect(response, resolve, reject)
      )
      request.setTimeout(this.timeoutMs, () => {
        request.destroy(new SunshineApiError('timeout', 'O Sunshine não respondeu a tempo.'))
      })
      request.on('error', (cause) => {
        reject(
          cause instanceof SunshineApiError
            ? cause
            : new SunshineApiError('unreachable', 'Não consegui falar com o Sunshine.')
        )
      })
      if (payload !== undefined) request.write(payload)
      request.end()
    })
  }

  private collect(
    response: IncomingMessage,
    resolve: (value: unknown) => void,
    reject: (cause: SunshineApiError) => void
  ): void {
    const chunks: Buffer[] = []
    let size = 0
    response.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        response.destroy()
        reject(
          new SunshineApiError('invalid-response', 'O Sunshine mandou uma resposta grande demais.')
        )
        return
      }
      chunks.push(chunk)
    })
    response.on('error', () =>
      reject(new SunshineApiError('unreachable', 'A conexão com o Sunshine caiu.'))
    )
    response.on('end', () => {
      const status = response.statusCode ?? 0
      if (status === 401 || status === 403) {
        reject(
          new SunshineApiError('unauthorized', 'O Sunshine recusou o usuário ou a senha.', status)
        )
        return
      }
      if (status < 200 || status >= 300) {
        reject(new SunshineApiError('server', `O Sunshine respondeu com o erro ${status}.`, status))
        return
      }
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(
          new SunshineApiError(
            'invalid-response',
            'O motor de transmissão mandou uma resposta ilegível.',
            status
          )
        )
      }
    })
  }
}

export type SunshineApiPort = Pick<
  SunshineApi,
  | 'listPairings'
  | 'listClientNames'
  | 'submitPin'
  | 'cancelPairing'
  | 'getConfig'
  | 'saveConfig'
  | 'restart'
  | 'closeApp'
>
