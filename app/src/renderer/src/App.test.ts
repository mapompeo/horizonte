import { afterAll, beforeAll, expect, test } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import type { AppState } from '../../shared/types'

let server: ViteDevServer
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    plugins: [svelte({ configFile: false })],
    server: { middlewareMode: true, watch: null },
    appType: 'custom'
  })
})
afterAll(async () => {
  await server?.close()
})

async function html(
  state: AppState | null,
  settingsOpen = false,
  error: string | null = null
): Promise<string> {
  const { snapshot, route, syncError } = await server.ssrLoadModule(
    '/src/renderer/src/lib/store.ts'
  )
  snapshot.set(
    state
      ? {
          state,
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
      : null
  )
  route.set(settingsOpen ? 'settings' : 'main')
  syncError.set(error)
  const { default: App } = await server.ssrLoadModule('/src/renderer/src/App.svelte')
  const { render } = await server.ssrLoadModule('svelte/server')
  return render(App).body
}

test('inicialização sem snapshot mostra carregamento em vez de tela branca', async () => {
  expect(await html(null)).toContain('Carregando')
})
test('falha inicial sem snapshot mostra erro e botão de retry', async () => {
  const body = await html(null, false, 'Não consegui carregar o Horizonte. Tente de novo.')
  expect(body).toContain('role="alert"')
  expect(body).toContain('Não consegui carregar o Horizonte')
  expect(body).toContain('Tentar de novo')
  expect(body).not.toContain('Enviar')
})
test('erro aparece mesmo com Ajustes aberto', async () => {
  const body = await html({ screen: 'error', mode: 'send', error: { message: 'Falha real' } }, true)
  expect(body).toContain('Falha real')
  expect(body).toContain('Tentar de novo')
  expect(body).not.toContain('sheet-title')
})
test('aprovação aparece mesmo com Ajustes aberto', async () => {
  const body = await html(
    { screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: null },
    true
  )
  expect(body).toContain('Permitir o Notebook?')
  expect(body).toContain('Recusar')
  expect(body).not.toContain('sheet-title')
})
