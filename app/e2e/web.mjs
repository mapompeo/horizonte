// Teste de ponta a ponta do receber pelo navegador: quem envia manda o quadro de teste e abre a página (porta 47920);
// um Chromium escondido (e2e/web-check) faz o papel do tablet, digita o código e confere que o vídeo chega. Precisa do `npm run build`.
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// No Windows, quem envia ainda usa o motor antigo (o próprio é o item D do plano), e o app de teste do tablet não
// chega a abrir na CI de lá: o teste volta junto com o envio pelo motor próprio no Windows.
if (process.platform === 'win32') {
  console.log('PULADO navegador: o envio pelo motor próprio ainda não existe no Windows')
  process.exit(0)
}

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const OUT = resolve('e2e-out')
mkdirSync(OUT, { recursive: true })
const PORT = 47918
const TIMEOUT_MS = 90_000

function launch(label, args, onLine = () => undefined) {
  const full = [`--user-data-dir=${mkdtempSync(join(tmpdir(), `hz-web-${label}-`))}`, ...args]
  if (process.platform === 'linux') full.unshift('--no-sandbox')
  const log = createWriteStream(join(OUT, `web-${label}.log`))
  const child = spawn(electronPath, full, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', HZ_WEB_TRACE: join(OUT, 'web-trace.log') }
  })
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      log.write(chunk)
      for (const line of String(chunk).split('\n'))
        if (line.includes('[motor]')) {
          console.log(`${label}: ${line.trim()}`)
          onLine(line)
        }
    })
  return child
}

let browser = null
const sender = launch(
  'envia',
  ['.', '--motor-send', '--motor-synthetic', '--motor-browser', `--motor-port=${PORT}`],
  (line) => {
    const match = /no navegador: http:\/\/\S+:(\d+) código (\d{6})/.exec(line)
    if (match && !browser)
      browser = launch('navegador', [
        resolve('e2e/web-check'),
        `http://127.0.0.1:${match[1]}/`,
        match[2]
      ])
  }
)

const code = await new Promise((resolveCode) => {
  const timer = setTimeout(() => resolveCode(1), TIMEOUT_MS)
  const wait = setInterval(() => {
    if (!browser) return
    clearInterval(wait)
    browser.on('exit', (exitCode) => {
      clearTimeout(timer)
      resolveCode(exitCode ?? 1)
    })
  }, 200)
})
if (code !== 0)
  for (const file of ['web-trace.log', 'web-navegador.log'])
    console.log(
      `--- ${file}\n` +
        (existsSync(join(OUT, file))
          ? readFileSync(join(OUT, file), 'utf8').slice(-4000)
          : '(não existe)')
    )
browser?.kill()
sender.kill()
console.log(
  code === 0 ? 'OK   navegador: a página recebeu o vídeo' : `FALHA navegador (código ${code})`
)
process.exit(code)
