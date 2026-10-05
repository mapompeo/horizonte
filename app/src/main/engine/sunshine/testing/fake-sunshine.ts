import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

const here = (name: string): string => fileURLToPath(new URL(name, import.meta.url))

export type FailNext = { status: number; raw?: string } | { destroy: true } | { huge: true }

export interface FakePairing {
  id: string
  name: string
  address: string
}

export interface FakeSunshine {
  /** Porta base, como a do Sunshine real: a API fica em basePort + 1. */
  basePort: number
  pairings: FakePairing[]
  config: Record<string, unknown>
  acceptPin: string
  submitted: { pairing_id: string; pin: string; name: string }[]
  cancelled: string[]
  closedApps: number
  calls: string[]
  delayMs: number
  failNext: FailNext | null
  rawPinResponse: unknown | null
  /** Aparelhos já pareados, como o Sunshine devolve em /api/clients/list. */
  clients: { name: string; uuid: string }[]
  rawClientsResponse: unknown | null
  close(): Promise<void>
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    request.on('end', () => resolve(body))
  })
}

function send(response: ServerResponse, status: number, body: unknown, raw?: string): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(raw ?? JSON.stringify(body))
}

/** Imita a parte da API do Sunshine que o Horizonte usa. O POST /api/config SUBSTITUI tudo, como no pior caso. */
export async function startFakeSunshine(credentials: {
  username: string
  password: string
}): Promise<FakeSunshine> {
  const expected =
    'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')

  const fake: FakeSunshine = {
    basePort: 0,
    pairings: [],
    config: {},
    acceptPin: '4821',
    submitted: [],
    cancelled: [],
    closedApps: 0,
    calls: [],
    delayMs: 0,
    failNext: null,
    rawPinResponse: null,
    clients: [],
    rawClientsResponse: null,
    close: () => closeServer()
  }

  const server: Server = createServer(
    {
      key: readFileSync(here('localhost-key.pem')),
      cert: readFileSync(here('localhost-cert.pem'))
    },
    (request, response) => {
      void handle(request, response)
    }
  )

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const route = `${request.method} ${request.url}`
    fake.calls.push(route)

    const failure = fake.failNext
    if (failure && 'destroy' in failure) {
      fake.failNext = null
      request.socket.destroy()
      return
    }
    if (fake.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, fake.delayMs))
    if (request.headers.authorization !== expected) {
      send(response, 401, { error: 'unauthorized' })
      return
    }

    if (failure) {
      fake.failNext = null
      if ('huge' in failure) {
        send(response, 200, null, '{"x":"' + 'a'.repeat(2_000_000) + '"}')
        return
      }
      send(response, failure.status, {}, failure.raw)
      return
    }

    const body = request.method === 'GET' ? '' : await readBody(request)
    const json = body ? (JSON.parse(body) as Record<string, unknown>) : {}

    switch (route) {
      case 'GET /api/clients/list':
        send(response, 200, fake.rawClientsResponse ?? { status: true, named_certs: fake.clients })
        return
      case 'GET /api/pin':
        send(response, 200, fake.rawPinResponse ?? { pairings: fake.pairings })
        return
      case 'POST /api/pin': {
        const submitted = json as { pairing_id: string; pin: string; name: string }
        fake.submitted.push(submitted)
        const known = fake.pairings.some((pairing) => pairing.id === submitted.pairing_id)
        const ok = known && submitted.pin === fake.acceptPin
        if (ok) {
          fake.pairings = fake.pairings.filter((pairing) => pairing.id !== submitted.pairing_id)
        }
        send(response, 200, { status: ok })
        return
      }
      case 'DELETE /api/pin': {
        const id = String(json.pairing_id)
        fake.cancelled.push(id)
        fake.pairings = fake.pairings.filter((pairing) => pairing.id !== id)
        send(response, 200, { status: true })
        return
      }
      case 'GET /api/config':
        send(response, 200, fake.config)
        return
      case 'POST /api/config':
        fake.config = json
        send(response, 200, { status: true })
        return
      case 'POST /api/restart':
        send(response, 200, { status: true })
        return
      case 'POST /api/apps/close':
        fake.closedApps++
        send(response, 200, { status: true })
        return
      default:
        send(response, 404, { error: 'not found' })
    }
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fake.basePort = (server.address() as AddressInfo).port - 1

  function closeServer(): Promise<void> {
    return new Promise((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  }

  return fake
}
