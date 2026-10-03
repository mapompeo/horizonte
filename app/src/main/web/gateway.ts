import { join } from 'node:path'
import type { WebAccess } from '../../shared/types'
import type { SunshineCredentials } from '../platform/types'

export const GATEWAY_PORT = 8080
/** Porta fixa do vídeo: precisa estar liberada no firewall (UDP). */
export const WEBRTC_PORTS = { min: 40000, max: 40010 }
export const GATEWAY_USER = 'horizonte'

/** O que o gateway lê. Sem servidores STUN: tudo fica na rede local, nada sai para a internet. */
export function buildGatewayConfig(options: {
  baseConfig: Record<string, unknown>
  bindAddress: string
  dataPath: string
  deviceName: string
}): Record<string, unknown> {
  const base = options.baseConfig as {
    data_storage?: object
    webrtc?: object
    web_server?: object
    moonlight?: object
  }
  return {
    ...options.baseConfig,
    data_storage: { ...base.data_storage, path: options.dataPath },
    webrtc: {
      ...base.webrtc,
      ice_servers: [],
      port_range: WEBRTC_PORTS,
      include_loopback_candidates: false
    },
    web_server: { ...base.web_server, bind_address: options.bindAddress },
    moonlight: { ...base.moonlight, pair_device_name: options.deviceName }
  }
}

export interface GatewayProcess {
  kill(): void
  onExit(listener: () => void): void
}

export interface GatewayDeps {
  dir: string
  /** Garante os arquivos do gateway (baixa na primeira vez) e devolve a pasta com o executável. */
  ensureFiles(): Promise<string>
  /** `web-server print-config`: a configuração padrão dele, como objeto. */
  defaultConfig(packageDir: string): Promise<Record<string, unknown>>
  writeConfig(path: string, config: Record<string, unknown>): Promise<void>
  spawn(packageDir: string, configPath: string): GatewayProcess
  /** Pergunta ao gateway; devolve o status HTTP (ou lança se ainda não responde). */
  post(url: string, body: unknown): Promise<number>
  ping(url: string): Promise<void>
  vault: {
    load(): Promise<SunshineCredentials | null>
    save(credentials: SunshineCredentials): Promise<void>
  }
  generateCode(): string
  lanAddress(): string | undefined
  sleep(ms: number): Promise<void>
  deviceName(): string
}

export interface Gateway {
  start(): Promise<WebAccess>
  stop(): Promise<void>
  status(): WebAccess
}

async function waitUp(deps: GatewayDeps, url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await deps.ping(url)
      return
    } catch {
      await deps.sleep(250)
    }
  }
  throw new Error('O servidor do navegador não respondeu. Tente de novo.')
}

/**
 * Receber pelo navegador: roda o Moonlight Web (WebRTC) nesta máquina. O acesso exige usuário e código,
 * porque depois de pareado qualquer um que chegue ao endereço veria a tela sem pedir licença de novo.
 * O primeiro login cria o administrador; por isso a criação é feita só em `127.0.0.1`, antes de abrir
 * para a rede, para ninguém da rede chegar primeiro.
 */
export function createGateway(deps: GatewayDeps): Gateway {
  let child: GatewayProcess | null = null
  let access: WebAccess = { on: false }

  const stopChild = (): void => {
    const running = child
    child = null
    running?.kill()
  }

  async function launch(packageDir: string, bind: string): Promise<void> {
    const configPath = join(deps.dir, 'config.json')
    const config = buildGatewayConfig({
      baseConfig: await deps.defaultConfig(packageDir),
      bindAddress: bind,
      dataPath: join(deps.dir, 'data.json'),
      deviceName: deps.deviceName()
    })
    await deps.writeConfig(configPath, config)
    child = deps.spawn(packageDir, configPath)
    await waitUp(deps, `http://127.0.0.1:${GATEWAY_PORT}/`)
  }

  return {
    status: () => access,
    async start() {
      if (child) return access
      try {
        const packageDir = await deps.ensureFiles()
        let credentials = await deps.vault.load()
        if (!credentials) {
          const code = deps.generateCode()
          await launch(packageDir, `127.0.0.1:${GATEWAY_PORT}`)
          const status = await deps.post(`http://127.0.0.1:${GATEWAY_PORT}/api/login`, {
            name: GATEWAY_USER,
            password: code
          })
          if (status !== 200) throw new Error('Não consegui criar o acesso do navegador.')
          credentials = { username: GATEWAY_USER, password: code, port: GATEWAY_PORT }
          await deps.vault.save(credentials)
          stopChild()
          await deps.sleep(500)
        }
        await launch(packageDir, `0.0.0.0:${GATEWAY_PORT}`)
        const address = deps.lanAddress()
        access = {
          on: true,
          url: address ? `http://${address}:${GATEWAY_PORT}` : undefined,
          user: credentials.username,
          code: credentials.password
        }
      } catch (cause) {
        stopChild()
        access = { on: false, error: cause instanceof Error ? cause.message : String(cause) }
      }
      return access
    },
    async stop() {
      stopChild()
      access = { on: false }
    }
  }
}
