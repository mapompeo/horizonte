import { describe, expect, it } from 'vitest'
import type { SunshineDisplay } from '../engine/sunshine/log'
import { existingDisplay, existingInstaller, readDevEngineConfig } from './existing'

const display = (friendlyName: string): SunshineDisplay => ({
  deviceId: '{x}',
  displayName: 'd',
  friendlyName,
  width: 1920,
  height: 1080,
  primary: false,
  originX: 0
})

describe('existingDisplay', () => {
  it.each(['VDD by MTT', 'Virtual Display Driver', 'Parsec Virtual Display', 'vdd'])(
    'reconhece %s como virtual',
    (name) => {
      expect(existingDisplay().isVirtual(display(name))).toBe(true)
    }
  )

  it.each(['24G2W1G4', 'DELL U2720Q', ''])('não confunde %s com virtual', (name) => {
    expect(existingDisplay().isVirtual(display(name))).toBe(false)
  })

  it('não cria nada: só garante sem erro', async () => {
    await expect(existingDisplay().ensureVirtualDisplay()).resolves.toBeUndefined()
    await expect(existingInstaller().ensureInstalled()).resolves.toBeUndefined()
  })
})

describe('readDevEngineConfig', () => {
  it('sem a variável do motor, usa o motor de mentira', () => {
    expect(readDevEngineConfig({})).toBeNull()
    expect(readDevEngineConfig({ HORIZONTE_ENGINE: 'fake' })).toBeNull()
  })

  it('lê usuário, senha, porta e caminho do log', () => {
    const config = readDevEngineConfig({
      HORIZONTE_ENGINE: 'sunshine',
      HORIZONTE_SUNSHINE_USER: 'matheus',
      HORIZONTE_SUNSHINE_PASSWORD: 'segredo',
      HORIZONTE_SUNSHINE_PORT: '48989',
      HORIZONTE_SUNSHINE_LOG: 'D:\\logs\\sunshine.log'
    })
    expect(config).toEqual({
      credentials: { username: 'matheus', password: 'segredo', port: 48989 },
      logPath: 'D:\\logs\\sunshine.log'
    })
  })

  it('usa a porta e o log padrão do Windows', () => {
    const config = readDevEngineConfig({
      HORIZONTE_ENGINE: 'sunshine',
      HORIZONTE_SUNSHINE_USER: 'u',
      HORIZONTE_SUNSHINE_PASSWORD: 'p'
    })
    expect(config?.credentials.port).toBe(47989)
    expect(config?.logPath).toBe('C:\\Program Files\\Sunshine\\config\\sunshine.log')
  })

  it.each([
    [{ HORIZONTE_SUNSHINE_PASSWORD: 'p' }],
    [{ HORIZONTE_SUNSHINE_USER: 'u' }],
    [{ HORIZONTE_SUNSHINE_USER: '', HORIZONTE_SUNSHINE_PASSWORD: 'p' }]
  ])('sem usuário ou senha explica o que falta, sem imprimir a senha', (extra) => {
    const run = (): unknown => readDevEngineConfig({ HORIZONTE_ENGINE: 'sunshine', ...extra })
    expect(run).toThrow('HORIZONTE_SUNSHINE_USER')
    try {
      run()
    } catch (cause) {
      expect(String((cause as Error).message)).not.toContain('"p"')
    }
  })

  it.each(['abc', '0', '-1', '70000', '47989.5'])('porta inválida %s é recusada', (port) => {
    expect(() =>
      readDevEngineConfig({
        HORIZONTE_ENGINE: 'sunshine',
        HORIZONTE_SUNSHINE_USER: 'u',
        HORIZONTE_SUNSHINE_PASSWORD: 'p',
        HORIZONTE_SUNSHINE_PORT: port
      })
    ).toThrow('HORIZONTE_SUNSHINE_PORT')
  })
})
