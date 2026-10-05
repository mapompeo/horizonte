import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const yml = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8')

test('um PR nunca cancela a publicação que está rodando na main', () => {
  const [top, jobs] = yml.split(/^jobs:\s*$/m)
  assert.doesNotMatch(top, /concurrency:/, 'a fila não pode valer para o workflow inteiro (PR incluído)')
  const deploy = jobs.slice(jobs.indexOf('  deploy:'))
  assert.match(deploy, /concurrency:\s*\n\s+group: pages\s*\n\s+cancel-in-progress: false/)
})
