import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectOs, OS_LABEL } from '../js/os.js'

test('Windows é o padrão, inclusive para user agent vazio ou desconhecido', () => {
  assert.equal(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows')
  assert.equal(detectOs(''), 'windows')
  assert.equal(detectOs('algo estranho'), 'windows')
})

test('reconhece macOS, iPhone e iPad como mac', () => {
  assert.equal(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)'), 'mac')
  assert.equal(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mac')
  assert.equal(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'mac')
})

test('reconhece Linux, Android e ChromeOS como linux', () => {
  assert.equal(detectOs('Mozilla/5.0 (X11; Linux x86_64)'), 'linux')
  assert.equal(detectOs('Mozilla/5.0 (Linux; Android 14)'), 'linux')
  assert.equal(detectOs('Mozilla/5.0 (X11; CrOS x86_64 15000.0.0)'), 'linux')
})

test('os nomes mostrados na página', () => {
  assert.deepEqual(OS_LABEL, { windows: 'Windows', linux: 'Linux', mac: 'macOS' })
})
