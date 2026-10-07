import { afterEach, expect, test, vi } from 'vitest'
import { get } from 'svelte/store'
import { snapshot, startSync, changeWebAccess, route, syncError } from './store'
import type { Snapshot } from '../../../shared/types'

const current: Snapshot = {
  state: { screen: 'ready', mode: 'send' },
  settings: {
    profile: 'equilibrado',
    bitrate: 30,
    resolution: '1080p',
    fps: 60,
    encoding: 'auto',
    codec: 'h264',
    autostart: false,
    deviceName: 'Desktop',
    mode: 'send'
  }
}

afterEach(() => {
  snapshot.set(null)
  route.set('main')
  syncError.set(null)
  vi.unstubAllGlobals()
})

test('falha inicial cancela a inscrição e permite tentar novamente sem inventar snapshot', async () => {
  const listeners = new Set<(value: Snapshot) => void>()
  let fail = true
  vi.stubGlobal('window', {
    horizonte: {
      onSnapshot: (listener: (value: Snapshot) => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      getSnapshot: async () => {
        if (fail) throw new Error('IPC')
        return current
      }
    }
  })
  await expect(startSync()).rejects.toThrow('IPC')
  expect(get(snapshot)).toBeNull()
  expect(get(syncError)).toBeTruthy()
  expect(listeners.size).toBe(0)
  fail = false
  const stop = await startSync()
  expect(get(snapshot)).toEqual(current)
  expect(get(syncError)).toBeNull()
  stop()
  expect(listeners.size).toBe(0)
})

test.each(['error', 'approve'] as const)(
  'push de %s fecha Ajustes e prevalece sobre leitura inicial atrasada',
  async (screen) => {
    const next: Snapshot = {
      ...current,
      state:
        screen === 'error'
          ? { screen: 'error', mode: 'send', error: { message: 'Falha real' } }
          : { screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: null }
    }
    let push: (value: Snapshot) => void = () => undefined
    let finish: (value: Snapshot) => void = () => undefined
    vi.stubGlobal('window', {
      horizonte: {
        onSnapshot: (listener: (value: Snapshot) => void) => {
          push = listener
          return () => undefined
        },
        getSnapshot: () =>
          new Promise<Snapshot>((resolve) => {
            finish = resolve
          })
      }
    })
    route.set('settings')
    const pending = startSync()
    push(next)
    finish(current)
    const stop = await pending
    expect(get(snapshot)).toEqual(next)
    expect(get(route)).toBe('main')
    stop()
  }
)

test('falha da leitura não descarta snapshot real recebido por push', async () => {
  let push: (value: Snapshot) => void = () => undefined
  vi.stubGlobal('window', {
    horizonte: {
      onSnapshot: (listener: (value: Snapshot) => void) => {
        push = listener
        return () => undefined
      },
      getSnapshot: async () => {
        push(current)
        throw new Error('IPC')
      }
    }
  })
  const stop = await startSync()
  expect(get(snapshot)).toEqual(current)
  expect(get(syncError)).toBeNull()
  stop()
})

test('falha na inscrição também publica erro recuperável sem snapshot', async () => {
  vi.stubGlobal('window', {
    horizonte: {
      onSnapshot: () => {
        throw new Error('preload')
      }
    }
  })
  await expect(startSync()).rejects.toThrow('preload')
  expect(get(snapshot)).toBeNull()
  expect(get(syncError)).toBeTruthy()
})

test('falha ao desligar mantém acesso confirmado e credenciais', async () => {
  const active = { on: true, url: 'http://desktop:8080', user: 'horizonte', code: '4821' }
  vi.stubGlobal('window', {
    horizonte: {
      setWebAccess: async () => {
        throw new Error('IPC')
      },
      getWebAccess: async () => {
        throw new Error('IPC')
      }
    }
  })
  expect(await changeWebAccess(active)).toMatchObject({ ...active, error: expect.any(String) })
})

test('falha ao mudar acesso consulta novamente o estado real', async () => {
  vi.stubGlobal('window', {
    horizonte: {
      setWebAccess: async () => {
        throw new Error('resposta perdida')
      },
      getWebAccess: async () => ({ on: false })
    }
  })
  expect(await changeWebAccess({ on: true })).toMatchObject({ on: false })
})

test('sucesso usa o acesso devolvido pelo backend e envia a intenção correta', async () => {
  vi.stubGlobal('window', {
    horizonte: {
      setWebAccess: async (on: boolean) => {
        if (on) throw new Error('deveria desligar')
        return { on: false }
      }
    }
  })
  expect(await changeWebAccess({ on: true })).toEqual({ on: false })
})
