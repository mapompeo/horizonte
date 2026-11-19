// Teste de ponta a ponta do receber pelo navegador: quem envia abre a página (porta 7777 ou a próxima livre) e o
// Chrome da máquina, escondido e dirigido pelo Playwright, faz o papel do celular: abre o link (o mesmo
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
  chrome: {
    engine: chromium,
    channels: ['chrome', 'msedge'],
    // Em espanhol: confere que a página fala o idioma do aparelho.
    context: { viewport: { width: 1024, height: 640 }, locale: 'es-ES' }
  },
  iphone: { engine: webkit, channels: [undefined], context: devices['iPhone 15'] },
  android: {
    engine: chromium,
    channels: ['chrome', 'msedge', undefined],
    context: devices['Pixel 7']
  }
}
if (!PHONES[PHONE]) throw new Error(`HZ_WEB_PHONE desconhecido: ${PHONE}`)
const TIMEOUT_MS = 90_000
// HZ_WEB_COMPAT=1: abre com `?compat`, o modo dos navegadores antigos (iPad sem WebRTC): imagens JPEG em vez de vídeo.
const COMPAT = process.env.HZ_WEB_COMPAT === '1'

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

/** O celular: abre o endereço, toca em Conectar e espera o vídeo andar. */
async function phone(url) {
  const phone = PHONES[PHONE]
  let browser = null
  for (const channel of phone.channels) {
    try {
      browser = await phone.engine.launch({ channel, headless: true })
      break
    } catch (error) {
      console.log(
        `navegador: sem ${channel ?? phone.engine.name()} (${String(error).split('\n')[0]})`
      )
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
    // Guarda cada conexão WebRTC que a página abrir, para ver por dentro se o vídeo não chegar.
    await page.addInitScript(() => {
      const Original = window.RTCPeerConnection
      window.__pcs = []
      window.RTCPeerConnection = function (...args) {
        const pc = new Original(...args)
        window.__pcs.push(pc)
        return pc
      }
      window.RTCPeerConnection.prototype = Original.prototype
      Object.assign(window.RTCPeerConnection, Original)
      window.RTCPeerConnection.generateCertificate = Original.generateCertificate.bind(Original)
      // Wake Lock de mentira (a de verdade só existe em https): conta quantas vezes a página pediu a tela acesa.
      window.__awake = 0
      Object.defineProperty(navigator, 'wakeLock', {
        value: {
          request: async () => {
            window.__awake++
            return { release: async () => undefined }
          }
        }
      })
      addEventListener('unhandledrejection', (event) =>
        console.error(`promessa recusada: ${event.reason}`)
      )
    })
    await page.goto(url)
    const greeting = await page.textContent('#texto')
    const expected = { chrome: 'Toca Conectar.' }[PHONE]
    if (expected && greeting !== expected) {
      console.log(`navegador: a página não falou o idioma do aparelho ("${greeting}")`)
      return 1
    }
    await page.click('#form button[type=submit], #form button')
    if (COMPAT) {
      // A imagem tem que trocar várias vezes (o quadro de teste anda): é o `more` pedindo a próxima.
      const frames = await page
        .waitForFunction(
          () => {
            const img = document.querySelector('img[src^="data:image/jpeg"]')
            if (!img || !img.naturalWidth) return null
            window.__srcs = window.__srcs ?? new Set()
            window.__srcs.add(img.src)
            return window.__srcs.size >= 5 ? `${img.naturalWidth}x${img.naturalHeight}` : null
          },
          null,
          { timeout: 45_000, polling: 50 }
        )
        .then((handle) => handle.jsonValue())
        .catch(() => null)
      console.log(
        frames
          ? `navegador: modo compatível, imagens ${frames}`
          : `navegador: sem imagens (${await page.textContent('#texto').catch(() => '?')})\n${said.slice(-30).join('\n')}`
      )
      await page.screenshot({ path: join(OUT, `web-compat-${PHONE}.png`) }).catch(() => undefined)
      return frames ? 0 : 1
    }
    const size = await page
      .waitForFunction(
        () => {
          const v = document.querySelector('video')
          return v && v.videoWidth > 0 && v.currentTime > 0.5
            ? `${v.videoWidth}x${v.videoHeight}`
            : null
        },
        null,
        { timeout: 45_000 }
      )
      .then((handle) => handle.jsonValue())
      .catch(() => null)
    if (!size) {
      console.log(`navegador: sem vídeo (${await page.textContent('#texto').catch(() => '?')})`)
      console.log(`--- o que a página disse\n${said.slice(-60).join('\n') || '(nada)'}`)
      const inside = await page
        .evaluate(async () =>
          Promise.all(
            (window.__pcs ?? []).map(async (pc) => ({
              signaling: pc.signalingState,
              ice: pc.iceConnectionState,
              gathering: pc.iceGatheringState,
              connection: pc.connectionState,
              remote: (pc.remoteDescription?.sdp ?? '')
                .split('\r\n')
                .filter((l) => /^a=candidate|^m=/.test(l)),
              local: (pc.localDescription?.sdp ?? '')
                .split('\r\n')
                .filter((l) => /^a=candidate|^m=/.test(l)),
              stats: [...(await pc.getStats()).values()]
                .filter((e) => /candidate|transport/.test(e.type))
                .map(
                  (e) =>
                    `${e.type} ${e.state ?? ''} ${e.address ?? e.ip ?? ''}:${e.port ?? ''} ${e.candidateType ?? ''}`
                )
            }))
          )
        )
        .catch((error) => `sem acesso: ${error}`)
      console.log(`--- conexões da página\n${JSON.stringify(inside, null, 1)}`)
    } else console.log(`navegador: vídeo ${size}`)
    if (size && !(await page.evaluate(() => window.__awake))) {
      console.log('navegador: não pediu para manter a tela acesa')
      return 1
    }
    // O Wi-Fi caiu de vez: a página tem que reconectar sozinha e voltar com vídeo novo, sem tocar em nada.
    const back =
      size &&
      (await page
        .evaluate(() => {
          document.querySelector('video').dataset.velho = '1'
          const pc = window.__pcs.at(-1)
          Object.defineProperty(pc, 'connectionState', { get: () => 'failed' })
          pc.dispatchEvent(new Event('connectionstatechange'))
        })
        .then(() =>
          page.waitForFunction(
            () => {
              const v = document.querySelector('video:not([data-velho])')
              return v && v.videoWidth > 0 && v.currentTime > 0.5
            },
            null,
            { timeout: 45_000 }
          )
        )
        .then(() => true)
        .catch(() => false))
    if (size) console.log(back ? 'navegador: reconectou sozinho' : 'navegador: não reconectou')
    await page.screenshot({ path: join(OUT, `web-${MODE}-${PHONE}.png`) }).catch(() => undefined)
    return size && back ? 0 : 1
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
    const match = /no navegador: (http:\/\/\S+:\d+)/.exec(line)
    if (match && !started) {
      started = true
      phone(COMPAT ? `${match[1]}/?compat` : match[1]).then(finish, (error) => {
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
