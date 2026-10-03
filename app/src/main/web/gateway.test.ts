import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SunshineCredentials } from '../platform/types'
import { buildGatewayConfig, createGateway, type GatewayDeps, type GatewayProcess } from './gateway'

const BASE = {
  data_storage: { type: 'json', path: 'server/data.json' },
  webrtc: { ice_servers: [{ urls: ['stun:stun.l.google.com:19302'] }], port_range: null },
  web_server: { bind_address: '0.0.0.0:8080', first_login_create_admin: true },
  moonlight: { pair_device_name: 'roth' }
}

describe('buildGatewayConfig', () => {
  const config = buildGatewayConfig({
    baseConfig: BASE,
    bindAddress: '0.0.0.0:8080',
    dataPath: 'D:/dados/data.json',
    deviceName: 'Notebook'
  }) as typeof BASE & { webrtc: { include_loopback_candidates: boolean } }

  it('tira os servidores STUN: nada sai da rede local', () => {
    expect(config.webrtc.ice_servers).toEqual([])
  })
  it('fixa a faixa de portas do vídeo, o nome do dispositivo e o arquivo de dados', () => {
    expect(config.webrtc.port_range).toEqual({ min: 40000, max: 40010 })
    expect(config.moonlight.pair_device_name).toBe('Notebook')
    expect(config.data_storage.path).toBe('D:/dados/data.json')
  })
  it('preserva o resto da configuração padrão', () => {
    expect(config.web_server.first_login_create_admin).toBe(true)
  })
})

interface Launch {
  bind: string
}

function harness(options: { stored?: boolean; loginStatus?: number; neverUp?: boolean } = {}): {
  deps: GatewayDeps
  launches: Launch[]
  killed: () => number
  saved: SunshineCredentials[]
  posts: { url: string; body: unknown }[]
} {
  const launches: Launch[] = []
  const saved: SunshineCredentials[] = []
  const posts: { url: string; body: unknown }[] = []
  let kills = 0
  let lastBind = ''
  const deps: GatewayDeps = {
    dir: join('D:', 'web'),
    ensureFiles: async () => 'D:/web/package',
    defaultConfig: async () => BASE,
    writeConfig: async (_path, config) => {
      lastBind = (config.web_server as { bind_address: string }).bind_address
    },
    spawn: (): GatewayProcess => {
      launches.push({ bind: lastBind })
      return { kill: () => void kills++, onExit: () => undefined }
    },
    post: async (url, body) => {
      posts.push({ url, body })
      return options.loginStatus ?? 200
    },
    ping: async () => {
      if (options.neverUp) throw new Error('fora do ar')
    },
    vault: {
      load: async () =>
        options.stored ? { username: 'horizonte', password: 'codigo-antigo', port: 8080 } : null,
      save: async (c) => void saved.push(c)
    },
    generateCode: () => 'codigo-novo',
    lanAddress: () => '192.168.1.3',
    sleep: async () => undefined,
    deviceName: () => 'Notebook'
  }
  return { deps, launches, killed: () => kills, saved, posts }
}

describe('createGateway', () => {
  it('primeira vez: cria o acesso só em 127.0.0.1 e só depois abre para a rede', async () => {
    const h = harness()
    const access = await createGateway(h.deps).start()

    expect(h.launches.map((l) => l.bind)).toEqual(['127.0.0.1:8080', '0.0.0.0:8080'])
    expect(h.posts[0]?.url).toBe('http://127.0.0.1:8080/api/login')
    expect(h.posts[0]?.body).toEqual({ name: 'horizonte', password: 'codigo-novo' })
    expect(h.saved).toEqual([{ username: 'horizonte', password: 'codigo-novo', port: 8080 }])
    expect(h.killed()).toBe(1) // o de bootstrap
    expect(access).toEqual({
      on: true,
      url: 'http://192.168.1.3:8080',
      user: 'horizonte',
      code: 'codigo-novo'
    })
  })

  it('já tem acesso guardado: sobe direto na rede, sem criar nada', async () => {
    const h = harness({ stored: true })
    const access = await createGateway(h.deps).start()

    expect(h.launches.map((l) => l.bind)).toEqual(['0.0.0.0:8080'])
    expect(h.posts).toEqual([])
    expect(access.code).toBe('codigo-antigo')
  })

  it('se não conseguir criar o acesso, não abre para a rede e explica', async () => {
    const h = harness({ loginStatus: 401 })
    const gateway = createGateway(h.deps)
    const access = await gateway.start()

    expect(access.on).toBe(false)
    expect(access.error).toMatch(/acesso do navegador/)
    expect(h.launches).toHaveLength(1)
    expect(h.saved).toEqual([])
    expect(h.killed()).toBe(1)
  })

  it('servidor que não responde vira erro, não espera para sempre', async () => {
    const h = harness({ stored: true, neverUp: true })
    const access = await createGateway(h.deps).start()
    expect(access.on).toBe(false)
    expect(access.error).toMatch(/não respondeu/)
  })

  it('parar encerra o processo e limpa o endereço; iniciar duas vezes não duplica', async () => {
    const h = harness({ stored: true })
    const gateway = createGateway(h.deps)
    await gateway.start()
    await gateway.start()
    expect(h.launches).toHaveLength(1)

    await gateway.stop()
    expect(h.killed()).toBe(1)
    expect(gateway.status()).toEqual({ on: false })
  })

  it('sem endereço de rede ainda liga, só não mostra o link', async () => {
    const h = harness({ stored: true })
    h.deps.lanAddress = (): undefined => undefined
    const access = await createGateway(h.deps).start()
    expect(access.on).toBe(true)
    expect(access.url).toBeUndefined()
  })
})
