import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/diagnostico.js'

const REPORT = 'Horizonte 0.2.0-beta.98\nSistema: win32 10.0.19045 x64\nlinha ``` do log'
let calls
let issues
const real = globalThis.fetch

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'token-de-teste'
  calls = []
  issues = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null })
    if (String(url).includes('?state=open')) return { ok: true, json: async () => issues }
    return { ok: true, json: async () => ({}) }
  }
})
afterEach(() => {
  globalThis.fetch = real
  delete process.env.GITHUB_TOKEN
})

const send = async (body) => {
  let out = { status: 0, json: null }
  const response = { status(code) { out.status = code; return response }, json(value) { out.json = value; return response } }
  await handler({ method: 'POST', body }, response)
  return out
}

test('botão: uma issue por envio, com o relatório todo', async () => {
  const out = await send({ texto: REPORT })
  assert.equal(out.status, 201)
  const post = calls.at(-1)
  assert.equal(post.body.title, 'Diagnóstico 0.2.0-beta.98')
  assert.deepEqual(post.body.labels, ['diagnostico'])
  assert.ok(!post.body.body.slice(4, -4).includes('```'), 'o relatório não fecha o bloco de código antes da hora')
})

test('automático: a primeira vez abre a issue do erro, versão e sistema', async () => {
  const out = await send({ texto: REPORT, automatico: true, codigo: '201' })
  assert.equal(out.status, 201)
  assert.equal(calls.at(-1).body.title, 'Erro 201 · 0.2.0-beta.98 · win32')
  assert.deepEqual(calls.at(-1).body.labels, ['erro-automatico'])
})

test('automático: o mesmo erro de outro computador vira comentário, sem issue nova', async () => {
  issues = [{ number: 7, title: 'Erro 201 · 0.2.0-beta.98 · win32', comments: 3 }]
  const out = await send({ texto: REPORT, automatico: true, codigo: '201' })
  assert.equal(out.status, 201)
  assert.equal(calls.at(-1).url.endsWith('/issues/7/comments'), true)
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/issues')).length, 0)
})

test('automático: issue que já tem comentários demais não ganha mais', async () => {
  issues = [{ number: 7, title: 'Erro 201 · 0.2.0-beta.98 · win32', comments: 25 }]
  const out = await send({ texto: REPORT, automatico: true, codigo: '201' })
  assert.equal(out.status, 200)
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0)
})

test('automático: só aceita código de 3 dígitos e versão em formato conhecido (o título não leva texto livre)', async () => {
  for (const codigo of ['20', '2011', 'abc', '2 1', undefined])
    assert.equal((await send({ texto: REPORT, automatico: true, codigo })).status, 400)
  const sujo = 'Horizonte 1.0"><img/src=x\nSistema: linux'
  assert.equal((await send({ texto: sujo, automatico: true, codigo: '201' })).status, 400)
  assert.equal(calls.length, 0)
})

test('recusa o que não é relatório do Horizonte ou é grande demais', async () => {
  assert.equal((await send({ texto: 'qualquer coisa' })).status, 400)
  assert.equal((await send({ texto: 'Horizonte 1\n' + 'x'.repeat(60_001) })).status, 400)
  assert.equal(calls.length, 0)
})
