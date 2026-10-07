// Teste de ponta a ponta do app aberto de verdade (Windows, Linux e macOS). Abre o Electron já compilado
// (`npm run build` antes), dirige a interface pelo protocolo de depuração e confere o fluxo, a memória do modo,
// a área de transferência e o desenho da barra do topo. Usa o motor de mentira do modo de desenvolvimento
// (nada é instalado). Capturas e resultados vão para app/e2e-out/.
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const OUT = resolve('e2e-out')
mkdirSync(OUT, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'hz-e2e-'))
const results = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ' :: ' + detail : ''}`)
}

async function launch(label) {
  const port = 9300 + Math.floor(Math.random() * 600)
  const args = ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`]
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu')
  const log = createWriteStream(join(OUT, `app-${label}.log`))
  const child = spawn(electronPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  let socketUrl = null
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && !socketUrl) {
    await wait(500)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      socketUrl =
        list.find((t) => t.type === 'page' && /index\.html|localhost/.test(t.url))
          ?.webSocketDebuggerUrl ?? null
    } catch {
      // ainda subindo
    }
  }
  if (!socketUrl) throw new Error(`o app não abriu a janela em 90 s (${label})`)
  const ws = new WebSocket(socketUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    ws.onopen = resolveOpen
    ws.onerror = rejectOpen
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result ?? message.error)
      pending.delete(message.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 760,
    height: 580,
    deviceScaleFactor: 1,
    mobile: false
  })

  const page = {
    ev: async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
        .result?.value,
    text: () => page.ev('document.body.innerText.replace(/\\s+/g, " ")'),
    async waitText(re, ms = 20_000) {
      const end = Date.now() + ms
      let last = ''
      while (Date.now() < end) {
        last = await page.text()
        if (re.test(last)) return last
        await wait(250)
      }
      throw new Error(`não apareceu ${re} em ${ms} ms; tela: "${last.slice(0, 160)}"`)
    },
    click: (re) =>
      page.ev(
        `(()=>{const re=${re.toString()};const b=[...document.querySelectorAll('button,[role=button]')].find(x=>re.test(x.innerText||x.getAttribute('aria-label')||''));if(!b)return false;b.click();return true})()`
      ),
    async shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'))
    },
    async close() {
      try {
        ws.close()
      } catch {
        // já fechado
      }
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
          // já saiu
        }
      } else {
        child.kill('SIGTERM')
        await wait(1500)
        child.kill('SIGKILL')
      }
      await wait(1500)
    }
  }
  return page
}

function readClipboardOnce() {
  if (process.platform === 'win32') {
    return execFileSync('powershell', ['-NoProfile', '-Sta', '-Command', 'Get-Clipboard -Raw'], {
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString()
  }
  if (process.platform === 'darwin') return execFileSync('pbpaste').toString()
  return execFileSync('xclip', ['-selection', 'clipboard', '-o']).toString()
}

/** A área de transferência pode estar ocupada por outro programa naquele instante: tenta de novo. */
async function readClipboard() {
  let last
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return readClipboardOnce()
    } catch (error) {
      last = error
      await wait(700)
    }
  }
  throw last
}

async function step(name, fn) {
  try {
    const detail = await fn()
    record(name, true, typeof detail === 'string' ? detail : '')
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error))
    throw error
  }
}

let app = null
try {
  // ---------- 1ª abertura: pessoa nova ----------
  app = await launch('1-primeira-vez')
  await step('abre direto na tela de começar', async () => {
    await app.waitText(/Começar/)
    await app.shot('01-comecar')
  })
  await step('o CSS sabe em que sistema roda (data-platform)', async () => {
    const platform = await app.ev('document.documentElement.dataset.platform')
    if (platform !== process.platform)
      throw new Error(`esperava ${process.platform}, veio ${platform}`)
    return platform
  })
  await step('Começar leva à escolha do modo sem preparar nada', async () => {
    await app.click(/Começar/)
    const text = await app.waitText(/Este dispositivo vai/)
    if (/Preparando/.test(text)) throw new Error('começou a preparar antes de escolher')
    await app.shot('02-escolha')
  })
  await step('escolher Mostrar vai direto para a lista, sem instalar nada', async () => {
    await app.click(/Mostrar a tela/)
    const text = await app.waitText(/Na sua rede/)
    if (/Preparando|permissão/.test(text))
      throw new Error('mostrou preparação/permissão no receptor')
    await app.shot('03-lista')
  })
  await step('a engrenagem não fica sob os botões da janela do macOS', async () => {
    const left = await app.ev(
      `Math.round(document.querySelector('[aria-label="Ajustes"]').getBoundingClientRect().left)`
    )
    if (process.platform === 'darwin' && left < 80)
      throw new Error(`engrenagem em ${left}px, cobre os botões`)
    return `engrenagem a ${left}px da borda`
  })
  await step(
    'ajustes: nome só para ver, botão do GitHub e diagnóstico copiado de verdade',
    async () => {
      await app.click(/Ajustes/)
      const text = await app.waitText(/Nome deste dispositivo/)
      if (!/GitHub/.test(text)) throw new Error('sem o botão do GitHub')
      await app.shot('04-ajustes')
      await app.click(/Copiar diagnóstico/)
      await app.waitText(/Copiado/, 8_000)
      let clipboard
      try {
        clipboard = await readClipboard()
      } catch (error) {
        // Sessões sem acesso à área de transferência (visto numa sessão local do Windows): só a CI é obrigada a ler.
        if (process.env.CI === 'true') throw error
        return 'PULADO: esta sessão não consegue ler a área de transferência (o app mostrou "Copiado")'
      }
      for (const part of ['Horizonte ', `Sistema: ${process.platform}`, 'Tela:', 'Qualidade:']) {
        if (!clipboard.includes(part))
          throw new Error(`o diagnóstico copiado não tem "${part}": ${clipboard.slice(0, 200)}`)
      }
      if (/4821|pair-/.test(clipboard)) throw new Error('o diagnóstico vazou PIN ou pedido')
      writeFileSync(join(OUT, 'diagnostico-copiado.txt'), clipboard)
      return clipboard.split('\n')[0]
    }
  )
  await app.close()

  // ---------- 2ª abertura: lembra o modo ----------
  app = await launch('2-lembra-mostrar')
  await step('reabrir: vai direto para Mostrar, sem a tela de começar', async () => {
    const text = await app.waitText(/Na sua rede/, 30_000)
    if (/Começar/.test(text)) throw new Error('mostrou a tela de começar de novo')
    await app.shot('05-reabriu-mostrar')
  })
  await step('trocar para Enviar pela pílula: prepara e chega em pronto', async () => {
    await app.click(/^Enviar$/)
    await app.waitText(/Pronto\./, 30_000)
    await app.shot('06-pronto')
  })
  await step(
    'envio completo: pedido de pareamento, aprovar e conectado com o nome do aparelho',
    async () => {
      await app.waitText(/Permitir o Notebook/, 30_000)
      await app.click(/^Permitir$/)
      const text = await app.waitText(/Notebook conectado/, 30_000)
      if (!/Tela estendida/.test(text)) throw new Error('sem "Tela estendida"')
      await app.shot('07-conectado')
    }
  )
  await app.close()

  // ---------- 3ª abertura: lembra Enviar ----------
  app = await launch('3-lembra-enviar')
  await step('reabrir: vai direto para Enviar e fica pronto', async () => {
    const text = await app.waitText(/Pronto\./, 30_000)
    if (/Começar|Na sua rede/.test(text)) throw new Error('abriu na tela errada')
    await app.shot('08-reabriu-enviar')
  })
} catch (error) {
  console.error('\nParou em:', error instanceof Error ? error.message : error)
  try {
    if (app) await app.shot('99-erro')
  } catch {
    // sem captura
  }
} finally {
  if (app) await app.close()
  writeFileSync(join(OUT, 'resultados.json'), JSON.stringify(results, null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(
    `\n${results.length - failed.length}/${results.length} passos ok em ${process.platform}`
  )
  process.exit(failed.length === 0 && results.length > 0 ? 0 : 1)
}
