// Teste de ponta a ponta do receber pelo navegador: quem envia abre a página (porta 47920 ou a próxima livre) e o
// Chrome da máquina, escondido e dirigido pelo Playwright, faz o papel do celular: abre o link com o código (o mesmo
// do QR e do Copiar link), toca em Conectar e confere que o vídeo anda. Precisa do `npm run build`.
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, devices, webkit } from 'playwright-core'


const require = createRequire(import.meta.url)
const electronPath = require('electron')
const OUT = resolve('e2e-out')
mkdirSync(OUT, { recursive: true })
const PORT = 47918
// HZ_WEB_MODE: synthetic (quadro de teste, padrão), screen (a tela de verdade) ou extend (uma tela estendida nova,
// pelo driver do Windows ou pela tela virtual do Mac). Os dois últimos são o uso real, com a captura do sistema.
const MODE = process.env.HZ_WEB_MODE ?? 'synthetic'
const MODE_ARGS = { synthetic: ['--motor-synthetic'], screen: [], extend: ['--motor-extend'] }[MODE]
if (!MODE_ARGS) throw new Error(`HZ_WEB_MODE desconhecido: ${MODE}`)
// HZ_WEB_PHONE: chrome (Chrome de computador, padrão), iphone (o motor do Safari, com tela, toque e user agent de
// iPhone) ou android (Chrome com tela e toque de celular Android). É o aparelho que de fato abre o QR.
const PHONE = process.env.HZ_WEB_PHONE ?? 'chrome'
const PHONES = {
  chrome: { engine: chromium, channels: ['chrome', 'msedge'], context: { viewport: { width: 1024, height: 640 } } },
  iphone: { engine: webkit, channels: [undefined], context: devices['iPhone 15'] },
  android: { engine: chromium, channels: ['chrome', 'msedge', undefined], context: devices['Pixel 7'] }
}
if (!PHONES[PHONE]) throw new Error(`HZ_WEB_PHONE desconhecido: ${PHONE}`)
const TIMEOUT_MS = 90_000

function launch(label, args, onLine = () => undefined) {
  const full = [`--user-data-dir=${mkdtempSync(join(tmpdir(), `hz-web-${label}-`))}`, ...args]
  if (process.platform === 'linux') full.unshift('--no-sandbox')
  const log = createWriteStream(join(OUT, `web-${label}.log`))
  const child = spawn(electronPath, full, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
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

/** O celular: abre endereço/código, confere o código já preenchido, conecta e espera o vídeo andar. */
async function phone(url, code) {
  const phone = PHONES[PHONE]
  let browser = null
  for (const channel of phone.channels) {
    try {
      browser = await phone.engine.launch({ channel, headless: true })
      break
    } catch (error) {
      console.log(`navegador: sem ${channel ?? phone.engine.name()} (${String(error).split('\n')[0]})`)
    }
  }
  if (!browser) return 1
  try {
    const page = await browser.newPage(phone.context)
    // Tudo que a página disse, para mostrar se falhar (erro de script, estado da conexão).
    const said = []
    page.on('console', (message) => {
      said.push(`${message.type()}: ${message.text()}`)
      if (message.text().includes('[motor]')) console.log(`navegador: ${message.text()}`)
    })
    page.on('pageerror', (error) => said.push(`erro: ${error.message}`))
    await page.goto(`${url}/${code}`)
    const filled = await page.inputValue('#codigo')
    if (filled !== code) {
      console.log(`navegador: o link não preencheu o código (veio "${filled}")`)
      return 1
    }
    await page.click('#form button[type=submit], #form button')
    const size = await page
      .waitForFunction(
        () => {
          const v = document.querySelector('video')
          return v && v.videoWidth > 0 && v.currentTime > 0.5 ? `${v.videoWidth}x${v.videoHeight}` : null
        },
        null,
        { timeout: 45_000 }
      )
      .then((handle) => handle.jsonValue())
      .catch(() => null)
    if (!size) {
      console.log(`navegador: sem vídeo (${await page.textContent('#texto').catch(() => '?')})`)
      console.log(`--- o que a página disse\n${said.slice(-60).join('\n') || '(nada)'}`)
    }
    else console.log(`navegador: vídeo ${size}`)
    await page.screenshot({ path: join(OUT, `web-${MODE}-${PHONE}.png`) }).catch(() => undefined)
    return size ? 0 : 1
  } finally {
    await browser.close()
  }
}

let started = false
let finish
const done = new Promise((resolveDone) => (finish = resolveDone))
const sender = launch(
  'envia',
  ['.', '--motor-send', ...MODE_ARGS, '--motor-browser', `--motor-port=${PORT}`],
  (line) => {
    // O endereço de rede que o QR leva, como um celular de verdade abriria (não o 127.0.0.1).
    const match = /no navegador: (http:\/\/\S+:\d+) código (\d{4})/.exec(line)
    if (match && !started) {
      started = true
      phone(match[1], match[2]).then(finish, (error) => {
        console.log(`navegador: erro ${error}`)
        finish(1)
      })
    }
  }
)

const code = await Promise.race([
  done,
  new Promise((resolveCode) => setTimeout(() => resolveCode(1), TIMEOUT_MS))
])
if (code !== 0)
  for (const file of ['web-envia.log'])
    console.log(
      `--- ${file}\n` +
        (existsSync(join(OUT, file))
          ? readFileSync(join(OUT, file), 'utf8').slice(-4000)
          : '(não existe)')
    )
sender.kill()
console.log(
  code === 0
    ? `OK   navegador (${MODE}, ${PHONE}): a página recebeu o vídeo`
    : `FALHA navegador (${MODE}, ${PHONE}, código ${code})`
)
process.exit(code)
