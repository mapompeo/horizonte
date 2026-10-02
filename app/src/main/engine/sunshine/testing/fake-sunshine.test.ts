import https from 'node:https'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startFakeSunshine, type FakeSunshine } from './fake-sunshine'

let fake: FakeSunshine

function get(path: string, auth?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        host: '127.0.0.1',
        port: fake.basePort + 1,
        path,
        method: 'GET',
        rejectUnauthorized: false,
        headers: auth ? { Authorization: auth } : {}
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => (body += chunk))
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }))
      }
    )
    request.on('error', reject)
    request.end()
  })
}

const basic = (user: string, password: string): string =>
  'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')

beforeEach(async () => {
  fake = await startFakeSunshine({ username: 'horizonte', password: 'segredo-123' })
})

afterEach(async () => {
  await fake.close()
})

describe('fake sunshine', () => {
  it('responde a lista de pareamentos com as credenciais certas', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    const reply = await get('/api/pin', basic('horizonte', 'segredo-123'))
    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual({
      pairings: [{ id: 'p1', name: 'Notebook', address: '192.168.1.2' }]
    })
    expect(fake.calls).toEqual(['GET /api/pin'])
  })

  it('recusa sem credenciais e com senha errada', async () => {
    expect((await get('/api/pin')).status).toBe(401)
    expect((await get('/api/pin', basic('horizonte', 'errada'))).status).toBe(401)
  })

  it('devolve 404 para rotas que não conhece', async () => {
    expect((await get('/api/nada', basic('horizonte', 'segredo-123'))).status).toBe(404)
  })
})
