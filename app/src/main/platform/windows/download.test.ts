import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { downloadVerified, DownloadError } from './download'

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')
const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

let dir: string
let server: Server
let routes: Record<string, (res: import('node:http').ServerResponse) => void>

const urlFor = (path: string): string =>
  `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-dl-'))
  routes = {}
  server = createServer((req, res) => {
    const route = routes[req.url ?? '']
    if (route) return route(res)
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

const serve = (path: string, body: Buffer): void => {
  routes[path] = (res) => {
    res.setHeader('content-length', body.length)
    res.end(body)
  }
}

describe('downloadVerified', () => {
  it('renova o prazo enquanto chegam dados, permitindo downloads demorados', async () => {
    const body = Buffer.alloc(6, 7)
    routes['/continuo'] = (res) => {
      res.setHeader('content-length', body.length)
      let sent = 0
      const timer = setInterval(() => {
        res.write(body.subarray(sent, ++sent))
        if (sent === body.length) {
          clearInterval(timer)
          res.end()
        }
      }, 30)
      res.on('close', () => clearInterval(timer))
    }
    const dest = join(dir, 'continuo')
    await downloadVerified(
      { url: urlFor('/continuo'), sha256: sha256(body) },
      dest,
      undefined,
      undefined,
      100
    )
    expect(await readFile(dest)).toEqual(body)
  })
  it.each(['sem-cabecalho', 'corpo-parado'])(
    'interrompe %s sem deixar arquivo parcial',
    async (route) => {
      routes[`/${route}`] = (res) => {
        if (route === 'corpo-parado') {
          res.setHeader('content-length', 1000)
          res.write(Buffer.alloc(10))
        }
        // O servidor aceita a conexão, mas não entrega mais nada.
        setTimeout(() => res.destroy(), 250)
      }
      const dest = join(dir, route)
      const failure = await downloadVerified(
        { url: urlFor(`/${route}`), sha256: 'a'.repeat(64) },
        dest,
        undefined,
        undefined,
        50
      ).catch((cause: unknown) => cause)
      expect(failure).toBeInstanceOf(DownloadError)
      expect((failure as DownloadError).kind).toBe('network')
      expect((failure as DownloadError).message).toMatch(/parou|tempo/i)
      expect(await exists(dest)).toBe(false)
      expect(await exists(`${dest}.part`)).toBe(false)
    },
    1000
  )

  it('baixa, confere o hash e deixa o arquivo no destino', async () => {
    const body = Buffer.from('conteudo do instalador')
    serve('/a.msi', body)
    const dest = join(dir, 'a.msi')

    await downloadVerified({ url: urlFor('/a.msi'), sha256: sha256(body) }, dest)

    expect(await readFile(dest)).toEqual(body)
  })

  it('hash diferente: recusa, apaga o arquivo e diz que não confia nele', async () => {
    serve('/a.msi', Buffer.from('adulterado'))
    const dest = join(dir, 'a.msi')

    const failure = await downloadVerified(
      { url: urlFor('/a.msi'), sha256: sha256(Buffer.from('original')) },
      dest
    ).catch((cause: unknown) => cause)

    expect(failure).toBeInstanceOf(DownloadError)
    expect((failure as DownloadError).kind).toBe('hash')
    expect((failure as DownloadError).message).toMatch(/confer|integridade|confi/i)
    expect(await exists(dest)).toBe(false)
  })

  it('o hash pode vir em maiúsculas', async () => {
    const body = Buffer.from('x')
    serve('/a', body)
    await downloadVerified(
      { url: urlFor('/a'), sha256: sha256(body).toUpperCase() },
      join(dir, 'a')
    )
  })

  it('resposta de erro do servidor vira falha de rede e não deixa arquivo', async () => {
    const dest = join(dir, 'a.msi')
    const failure = await downloadVerified(
      { url: urlFor('/nao-existe'), sha256: 'a'.repeat(64) },
      dest
    ).catch((cause: unknown) => cause)

    expect((failure as DownloadError).kind).toBe('network')
    expect(await exists(dest)).toBe(false)
  })

  it('servidor fora do ar vira falha de rede em português', async () => {
    // A porta 1 não tem ninguém escutando: a conexão é recusada.
    const failure = await downloadVerified(
      { url: 'http://127.0.0.1:1/x', sha256: 'a'.repeat(64) },
      join(dir, 'x')
    ).catch((cause: unknown) => cause)

    expect((failure as DownloadError).kind).toBe('network')
    expect((failure as DownloadError).message).toMatch(/internet|conex/i)
  })

  it('corte no meio do download não deixa arquivo parcial', async () => {
    routes['/cortado'] = (res) => {
      res.setHeader('content-length', 1000)
      res.write(Buffer.alloc(100))
      setTimeout(() => res.destroy(), 20)
    }
    const dest = join(dir, 'c')
    const failure = await downloadVerified(
      { url: urlFor('/cortado'), sha256: 'a'.repeat(64) },
      dest
    ).catch((cause: unknown) => cause)

    expect(failure).toBeInstanceOf(DownloadError)
    expect(await exists(dest)).toBe(false)
  })

  it('avisa o progresso de 0 a 1, terminando em 1', async () => {
    const body = Buffer.alloc(200_000, 7)
    serve('/grande', body)
    const seen: number[] = []

    await downloadVerified({ url: urlFor('/grande'), sha256: sha256(body) }, join(dir, 'g'), (p) =>
      seen.push(p)
    )

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((p) => p >= 0 && p <= 1)).toBe(true)
    expect(seen.at(-1)).toBe(1)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('cancelar pelo sinal para o download e não deixa arquivo', async () => {
    routes['/lento'] = (res) => {
      res.setHeader('content-length', 1_000_000)
      res.write(Buffer.alloc(10))
    }
    const abort = new AbortController()
    const dest = join(dir, 'l')
    const pending = downloadVerified(
      { url: urlFor('/lento'), sha256: 'a'.repeat(64) },
      dest,
      undefined,
      abort.signal
    ).catch((cause: unknown) => cause)
    setTimeout(() => abort.abort(), 30)

    const failure = await pending
    expect((failure as DownloadError).kind).toBe('cancelled')
    expect(await exists(dest)).toBe(false)
  })
})
