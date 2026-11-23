// Teste de ponta a ponta do motor novo: duas instâncias do Electron na mesma máquina, com perfis separados. Uma
// envia um quadro de teste (no lugar da tela, que a CI não tem), a outra mostra, confere a cor de um bloco fixo
// depois de 120 quadros e sai com 0. É uma transmissão real pelo WebRTC, só sem a captura do sistema.
// Precisa do `npm run build` antes. Logs vão para app/e2e-out/.
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const OUT = resolve('e2e-out')
mkdirSync(OUT, { recursive: true })
const PORT = 47917
const TIMEOUT_MS = 90_000

function launch(label, extra) {
  const args = [
    '.',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), `hz-motor-${label}-`))}`,
    ...extra
  ]
  if (process.platform === 'linux') args.push('--no-sandbox')
  const log = createWriteStream(join(OUT, `motor-${label}.log`))
  const child = spawn(electronPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  })
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      log.write(chunk)
      for (const line of String(chunk).split('\n'))
        if (line.includes('[motor]')) console.log(`${label}: ${line.trim()}`)
    })
  return child
}

const sender = launch('envia', ['--motor-send', '--motor-synthetic', `--motor-port=${PORT}`])
await new Promise((r) => setTimeout(r, 4000))
const receiver = launch('mostra', [
  `--motor-receive=127.0.0.1:${PORT}`,
  '--motor-size=1280x720',
  '--motor-test-frames=120'
])

const code = await new Promise((resolveCode) => {
  const timer = setTimeout(() => {
    console.log('FALHA: o teste passou do tempo')
    receiver.kill()
    resolveCode(1)
  }, TIMEOUT_MS)
  receiver.on('exit', (exitCode) => {
    clearTimeout(timer)
    resolveCode(exitCode ?? 1)
  })
})
sender.kill()
console.log(
  code === 0 ? 'OK   motor: quadro de teste chegou e confere' : `FALHA motor (código ${code})`
)
process.exit(code)
