import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { isLocalPageUrl, startBrowserBridge, type BrowserBridge } from './browser'

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
    host: '127.0.0.1'
  })
  base = `http://127.0.0.1:${bridge.port}`
})

afterEach(async () => {
  await bridge.stop()
  for (const socket of peers) socket.destroy()
  await new Promise<void>((resolve) => signaling.close(() => resolve()))
})

const open = (): Promise<Response> => fetch(`${base}/api/abrir`, { method: 'POST', body: '{}' })

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
  // Links de versões antigas, com o código ("/1234"), abrem a mesma página; outros caminhos continuam fechados.
  expect(await (await fetch(`${base}/1234`)).text()).toContain('<title>Horizonte</title>')
  expect((await fetch(`${base}/12345`)).status).toBe(404)
  expect((await fetch(`${base}/assets/../segredo.txt`)).status).toBe(404)
  expect((await fetch(`${base}/assets/%2e%2e/segredo.txt`)).status).toBe(404)
})

test('manifesto: adicionada à tela de início, a página abre como app em tela inteira', async () => {
  const res = await fetch(`${base}/manifest.webmanifest`)
  expect(res.headers.get('content-type')).toContain('application/manifest+json')
  expect(await res.json()).toMatchObject({ display: 'fullscreen', start_url: '/' })
})

test('sem código: abre direto, e no máximo 8 sessões ao mesmo tempo', async () => {
  for (let i = 0; i < 8; i++) expect((await open()).status).toBe(200)
  expect((await open()).status).toBe(429)
})

test('liga o navegador à sinalização nos dois sentidos', async () => {
  const res = await open()
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

test('modo compatível: a imagem fica na ponte e o evento só leva o número', async () => {
  const { sessao } = (await (await open()).json()) as { sessao: string }
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
  const events = readEvents(sessao, 2)
  await expect.poll(() => peers.length).toBe(1)
  peers[0].write(`{"t":"jpeg","data":"data:image/jpeg;base64,${bytes.toString('base64')}"}\n`)
  expect(await events).toEqual(['{"t":"pending"}', '{"t":"quadro","n":1}'])
  const res = await fetch(`${base}/api/quadro?sessao=${sessao}&n=1`)
  expect(res.headers.get('content-type')).toBe('image/jpeg')
  expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes)
  expect((await fetch(`${base}/api/quadro?sessao=outra`)).status).toBe(404)
})

test('MJPEG: com a resposta aberta, a imagem vai nela e a ponte pede a próxima ao computador', async () => {
  const { sessao } = (await (await open()).json()) as { sessao: string }
  await expect.poll(() => peers.length).toBe(1)
  const res = await fetch(`${base}/api/video?sessao=${sessao}`)
  expect(res.headers.get('content-type')).toBe(
    'multipart/x-mixed-replace; boundary=horizonte-quadro'
  )
  const bytes = Buffer.from([0xff, 0xd8, 7, 8, 0xff, 0xd9])
  peers[0].write(`{"t":"jpeg","data":"data:image/jpeg;base64,${bytes.toString('base64')}"}\n`)
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  let got = Buffer.alloc(0)
  while (!got.includes(Buffer.from([0xff, 0xd9]))) {
    const { value } = await reader.read()
    got = Buffer.concat([got, Buffer.from(value as Uint8Array)])
  }
  await reader.cancel()
  expect(got.toString('latin1')).toContain(
    '--horizonte-quadro\r\nContent-Type: image/jpeg\r\nContent-Length: 6\r\n\r\n'
  )
  expect(got.includes(bytes)).toBe(true)
  await expect.poll(() => received).toEqual(['{"t":"more"}'])
})

test('pedir uma imagem avulsa larga a resposta MJPEG (navegador que não mostra MJPEG)', async () => {
  const { sessao } = (await (await open()).json()) as { sessao: string }
  await expect.poll(() => peers.length).toBe(1)
  const video = await fetch(`${base}/api/video?sessao=${sessao}`)
  const bytes = Buffer.from([0xff, 0xd8, 9, 0xff, 0xd9])
  peers[0].write(`{"t":"jpeg","data":"data:image/jpeg;base64,${bytes.toString('base64')}"}\n`)
  await expect.poll(() => received).toEqual(['{"t":"more"}'])
  const frame = await fetch(`${base}/api/quadro?sessao=${sessao}&n=1`)
  expect(Buffer.from(await frame.arrayBuffer())).toEqual(bytes)
  // A resposta MJPEG terminou, e a próxima imagem volta a ser avisada pelos eventos.
  await (video.body as ReadableStream<Uint8Array>).pipeTo(new WritableStream())
  const events = readEvents(sessao, 2)
  peers[0].write(`{"t":"jpeg","data":"data:image/jpeg;base64,${bytes.toString('base64')}"}\n`)
  expect((await events)[1]).toBe('{"t":"quadro","n":2}')
})

test('mensagem fora do formato da sinalização não passa', async () => {
  const { sessao } = (await (await open()).json()) as { sessao: string }
  const sent = await fetch(`${base}/api/enviar?sessao=${sessao}`, {
    method: 'POST',
    body: JSON.stringify({ t: 'qualquer', x: 1 })
  })
  expect(sent.status).toBe(400)
  expect(received).toEqual([])
})

test('sem o computador esperando conexão, avisa', async () => {
  signalingPort = null
  expect((await open()).status).toBe(409)
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

test('compartilhar só aceita o endereço da página na rede local', () => {
  expect(isLocalPageUrl('http://192.168.1.6:7777')).toBe(true)
  for (const bad of [
    'http://192.168.1.6:7777/1234',
    'https://192.168.1.6:7777',
    'http://exemplo.com:7777',
    'file:///etc/passwd',
    'http://192.168.1.6:7777\njavascript:1',
    42
  ])
    expect(isLocalPageUrl(bad)).toBe(false)
})
