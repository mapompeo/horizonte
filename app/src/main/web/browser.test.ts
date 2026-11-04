import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startBrowserBridge, type BrowserBridge } from './browser'

let signaling: Server
let signalingPort: number | null
let received: string[]
let peers: Socket[]
let bridge: BrowserBridge
let base: string
let pages: string

beforeEach(async () => {
  received = []
  peers = []
  // Faz o papel da sinalização: guarda o que chega e responde com um "pending".
  signaling = createServer((socket) => {
    peers.push(socket)
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => received.push(...chunk.split('\n').filter(Boolean)))
    socket.write('{"t":"pending"}\n')
  })
  await new Promise<void>((resolve) => signaling.listen(0, '127.0.0.1', resolve))
  const address = signaling.address()
  signalingPort = typeof address === 'object' && address ? address.port : null
  pages = mkdtempSync(join(tmpdir(), 'hz-web-'))
  mkdirSync(join(pages, 'assets'))
  writeFileSync(join(pages, 'web.html'), '<!doctype html><title>Horizonte</title>')
  writeFileSync(join(pages, 'assets', 'web.js'), 'console.log(1)')
  writeFileSync(join(pages, 'segredo.txt'), 'não')
  bridge = await startBrowserBridge({
    pagesDir: pages,
    signalingPort: () => signalingPort,
    port: 0,
    host: '127.0.0.1',
    generateCode: () => '123456'
  })
  base = `http://127.0.0.1:${bridge.port}`
})

afterEach(async () => {
  await bridge.stop()
  for (const socket of peers) socket.destroy()
  await new Promise<void>((resolve) => signaling.close(() => resolve()))
})

const open = (codigo: string): Promise<Response> =>
  fetch(`${base}/api/abrir`, { method: 'POST', body: JSON.stringify({ codigo }) })

/** Lê eventos do SSE até achar `count` mensagens. */
async function readEvents(id: string, count: number): Promise<string[]> {
  const res = await fetch(`${base}/api/eventos?sessao=${id}`)
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let text = ''
  const lines: string[] = []
  while (lines.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
    let at: number
    while ((at = text.indexOf('\n\n')) >= 0) {
      const block = text.slice(0, at)
      text = text.slice(at + 2)
      const data = block.split('\n').find((l) => l.startsWith('data: '))
      if (data) lines.push(data.slice(6))
    }
  }
  await reader.cancel()
  return lines
}

test('serve a página e os arquivos dela, e mais nada da pasta', async () => {
  expect((await fetch(`${base}/`)).status).toBe(200)
  expect(await (await fetch(`${base}/assets/web.js`)).text()).toBe('console.log(1)')
  expect((await fetch(`${base}/segredo.txt`)).status).toBe(404)
  expect((await fetch(`${base}/assets/../segredo.txt`)).status).toBe(404)
  expect((await fetch(`${base}/assets/%2e%2e/segredo.txt`)).status).toBe(404)
})

test('manifesto: adicionada à tela de início, a página abre como app em tela inteira', async () => {
  const res = await fetch(`${base}/manifest.webmanifest`)
  expect(res.headers.get('content-type')).toContain('application/manifest+json')
  expect(await res.json()).toMatchObject({ display: 'fullscreen', start_url: '/' })
})

test('código errado não abre; cinco erros travam até o código certo', async () => {
  expect((await open('000000')).status).toBe(403)
  for (let i = 0; i < 4; i++) await open('000000')
  expect((await open('123456')).status).toBe(429)
})

test('com o código, liga o navegador à sinalização nos dois sentidos', async () => {
  const res = await open('123456')
  expect(res.status).toBe(200)
  const { sessao } = (await res.json()) as { sessao: string }
  expect(await readEvents(sessao, 1)).toEqual(['{"t":"pending"}'])

  const sent = await fetch(`${base}/api/enviar?sessao=${sessao}`, {
    method: 'POST',
    body: JSON.stringify({ t: 'cancel' })
  })
  expect(sent.status).toBe(204)
  await expect.poll(() => received).toEqual(['{"t":"cancel"}'])
})

test('mensagem fora do formato da sinalização não passa', async () => {
  const { sessao } = (await (await open('123456')).json()) as { sessao: string }
  const sent = await fetch(`${base}/api/enviar?sessao=${sessao}`, {
    method: 'POST',
    body: JSON.stringify({ t: 'qualquer', x: 1 })
  })
  expect(sent.status).toBe(400)
  expect(received).toEqual([])
})

test('sem o computador esperando conexão, avisa', async () => {
  signalingPort = null
  expect((await open('123456')).status).toBe(409)
})

test('sessão que não existe não recebe nem manda', async () => {
  expect((await fetch(`${base}/api/eventos?sessao=nada`)).status).toBe(404)
  const sent = await fetch(`${base}/api/enviar?sessao=nada`, {
    method: 'POST',
    body: '{"t":"cancel"}'
  })
  expect(sent.status).toBe(404)
})

test('com a primeira porta ocupada por outro programa, pega a próxima da faixa', async () => {
  const { createServer: createHttp } = await import('node:http')
  const { BROWSER_PORT } = await import('./browser')
  const squatter = createHttp()
  const taken = await new Promise<boolean>((resolve) => {
    squatter.once('error', () => resolve(false))
    squatter.listen(BROWSER_PORT, '127.0.0.1', () => resolve(true))
  })
  const second = await startBrowserBridge({
    pagesDir: pages,
    signalingPort: () => signalingPort,
    host: '127.0.0.1'
  })
  try {
    expect(second.port).toBeGreaterThan(BROWSER_PORT)
    expect(second.port).toBeLessThanOrEqual(BROWSER_PORT + 9)
  } finally {
    await second.stop()
    if (taken) await new Promise<void>((resolve) => squatter.close(() => resolve()))
  }
})
