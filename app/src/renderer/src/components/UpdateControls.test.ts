import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { compile } from 'svelte/compiler'
import type { Component } from 'svelte'
import type { UpdateStatus } from '../../../shared/updates'

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis }
}
let server: ViteDevServer
let dom: { window: Window & typeof globalThis }
let runtime: typeof import('svelte')
let component: Component
let mounted: ReturnType<(typeof import('svelte'))['mount']> | null = null
let listener: (status: UpdateStatus) => void
let pushOnSubscribe: UpdateStatus | null = null
const stop = vi.fn()
const getStatus = vi.fn<() => Promise<UpdateStatus>>()
const update = vi.fn<() => Promise<UpdateStatus>>()
const current: UpdateStatus = { phase: 'current', currentVersion: '1.0.0' }
const ready: UpdateStatus = { phase: 'ready', currentVersion: '1.0.0', version: '2.0.0' }

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: Error): void
} {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  for (const key of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'Text',
    'Comment',
    'Event',
    'navigator'
  ]) {
    vi.stubGlobal(key, Reflect.get(dom.window, key))
  }
  const filename = resolve('src/renderer/src/components/UpdateControls.svelte')
  server = await createServer({
    configFile: false,
    resolve: {
      alias: [{ find: /^svelte$/, replacement: resolve('node_modules/svelte/src/index-client.js') }]
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: 'update-controls-client-test',
        resolveId(id) {
          if (id === 'virtual:update-controls') return '\0update-controls'
          return null
        },
        async load(id) {
          if (id === '\0update-controls')
            return compile(await readFile(filename, 'utf8'), { filename, generate: 'client' }).js
              .code
          return null
        }
      }
    ],
    server: { middlewareMode: true, watch: null },
    appType: 'custom'
  })
  runtime = (await server.ssrLoadModule('svelte')) as unknown as typeof import('svelte')
  component = (await server.ssrLoadModule('virtual:update-controls')).default
})

beforeEach(() => {
  pushOnSubscribe = null
  stop.mockReset()
  getStatus.mockReset().mockResolvedValue(current)
  update.mockReset().mockResolvedValue(current)
  Object.defineProperty(dom.window, 'horizonte', {
    configurable: true,
    value: {
      getUpdateStatus: getStatus,
      update,
      onUpdate: (callback: typeof listener) => {
        listener = callback
        if (pushOnSubscribe) callback(pushOnSubscribe)
        return stop
      }
    }
  })
})

async function flush(): Promise<void> {
  await Promise.resolve()
  await runtime.tick()
}

function mount(): void {
  mounted = runtime.mount(component, { target: document.body })
  runtime.flushSync()
}

afterEach(async () => {
  if (mounted) await runtime.unmount(mounted)
  mounted = null
  document.body.replaceChildren()
})

afterAll(async () => {
  await server?.close()
  dom?.window.close()
  vi.unstubAllGlobals()
})

test('push recebido antes da consulta inicial não é sobrescrito pela resposta antiga', async () => {
  const initial = deferred<UpdateStatus>()
  getStatus.mockReturnValue(initial.promise)
  mount()
  listener(ready)
  await flush()
  initial.resolve(current)
  await flush()
  expect(document.body.textContent).toContain('Atualização pronta')
  expect(document.body.textContent).not.toContain('versão mais recente')
})

test('falha inicial mostra erro e retry da consulta sem inventar versão ou status', async () => {
  getStatus.mockRejectedValueOnce(new Error('IPC indisponível'))
  mount()
  await flush()
  expect(document.querySelector('section')?.textContent ?? '').toContain('Atualizações')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Não consegui')
  expect(document.body.textContent).not.toContain('Versão')
  const retry = document.querySelector('button')
  expect(retry?.textContent).toContain('Tentar de novo')
  retry?.click()
  await flush()
  expect(getStatus).toHaveBeenCalledTimes(2)
  expect(update).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('Versão 1.0.0')
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

test('cleanup remove subscription e ignora consulta e push depois de unmount', async () => {
  const initial = deferred<UpdateStatus>()
  getStatus.mockReturnValue(initial.promise)
  mount()
  await runtime.unmount(mounted!)
  mounted = null
  expect(stop).toHaveBeenCalledTimes(1)
  initial.resolve(ready)
  listener(ready)
  await flush()
  expect(document.body.textContent).toBe('')
})

test('resposta antiga de ação não sobrescreve push mais novo', async () => {
  const action = deferred<UpdateStatus>()
  update.mockReturnValue(action.promise)
  mount()
  await flush()
  document.querySelector('button')?.click()
  listener(ready)
  action.resolve(current)
  await flush()
  expect(document.body.textContent).toContain('Atualização pronta')
})

test('push síncrono na assinatura também vence a consulta inicial', async () => {
  pushOnSubscribe = ready
  mount()
  await flush()
  expect(document.body.textContent).toContain('Atualização pronta')
})

test('rejeição atrasada da consulta não substitui push por erro', async () => {
  const initial = deferred<UpdateStatus>()
  getStatus.mockReturnValue(initial.promise)
  mount()
  listener(ready)
  initial.reject(new Error('IPC indisponível'))
  await flush()
  expect(document.body.textContent).toContain('Atualização pronta')
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

test('retry falhando continua mostrando erro sem versão fictícia', async () => {
  getStatus.mockRejectedValue(new Error('IPC indisponível'))
  mount()
  await flush()
  document.querySelector('button')?.click()
  await flush()
  expect(getStatus).toHaveBeenCalledTimes(2)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Não consegui')
  expect(document.body.textContent).not.toContain('Versão')
  expect(document.querySelector('button')?.disabled).toBe(false)
})

test('push durante retry vence sua resposta antiga', async () => {
  const retry = deferred<UpdateStatus>()
  getStatus.mockRejectedValueOnce(new Error('IPC indisponível')).mockReturnValueOnce(retry.promise)
  mount()
  await flush()
  document.querySelector('button')?.click()
  listener(ready)
  retry.resolve(current)
  await flush()
  expect(document.body.textContent).toContain('Atualização pronta')
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

test('rejeição de ação após unmount não acessa status nem recria UI', async () => {
  const action = deferred<UpdateStatus>()
  const readVersion = vi.fn(() => '1.0.0')
  getStatus.mockResolvedValue({
    phase: 'current',
    get currentVersion() {
      return readVersion()
    }
  })
  update.mockReturnValue(action.promise)
  mount()
  await flush()
  document.querySelector('button')?.click()
  await runtime.unmount(mounted!)
  mounted = null
  readVersion.mockClear()
  action.reject(new Error('IPC indisponível'))
  await flush()
  expect(readVersion).not.toHaveBeenCalled()
  expect(document.body.textContent).toBe('')
  expect(stop).toHaveBeenCalledTimes(1)
})
