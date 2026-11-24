// Teste de ponta a ponta do app aberto de verdade (Windows, Linux e macOS). Abre o Electron já compilado
// (`npm run build` antes), dirige a interface pelo protocolo de depuração e confere o fluxo, a memória do modo,
// a área de transferência e o desenho da barra do topo. Usa o motor de mentira do modo de desenvolvimento
// (nada é instalado). Capturas e resultados vão para app/e2e-out/.
import { execFileSync, spawn } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
// E2E_PACKAGED=1: abre o app já empacotado (dist/, de `electron-builder --dir`) em vez do código-fonte, e só confere
// o que o empacotamento pode quebrar: abrir, achar os recursos e chegar na escolha do modo.
const packaged = process.env.E2E_PACKAGED === '1'

function packagedExecutable() {
  const dist = resolve('dist')
  if (process.platform === 'win32') return join(dist, 'win-unpacked', 'Horizonte.exe')
  if (process.platform === 'linux') {
    return ['Horizonte', 'horizonte'].map((n) => join(dist, 'linux-unpacked', n)).find(existsSync)
  }
  const mac = readdirSync(dist).find((d) => d.startsWith('mac'))
  return join(dist, mac, 'Horizonte.app', 'Contents', 'MacOS', 'Horizonte')
}

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
  const args = [
    ...(packaged ? [] : ['.']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    // Os passos procuram os textos em português: o idioma fica fixo, seja qual for o da máquina da CI.
    '--lang=pt-BR'
  ]
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu')
  const log = createWriteStream(join(OUT, `app-${label}.log`))
  const executable = packaged ? packagedExecutable() : electronPath
  if (!executable || !existsSync(executable))
    throw new Error(`não achei o app para abrir: ${executable}`)
  const child = spawn(executable, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    // Do código-fonte, o roteiro do motor de mentira (pedido e conexão simulados); empacotado, o motor de verdade.
    env: packaged ? { ...process.env } : { ...process.env, HORIZONTE_ENGINE: 'fake' }
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
  // Com prazo: a janela escondida (no Windows) pode nunca responder a um print, e o teste esperaria até a CI cair.
  const send = (method, params = {}) =>
    new Promise((r, reject) => {
      const i = ++id
      const timer = setTimeout(() => {
        pending.delete(i)
        reject(new Error(`a janela não respondeu a ${method} em 20 s`))
      }, 20_000)
      pending.set(i, (value) => {
        clearTimeout(timer)
        r(value)
      })
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
    pressed: (text) =>
      page.ev(
        `[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.innerText.trim()===${JSON.stringify(text)})?.getAttribute('aria-pressed') ?? null`
      ),
    async until(expression, what, ms = 10_000) {
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (await page.ev(expression)) return
        await wait(200)
      }
      throw new Error(`não aconteceu em ${ms} ms: ${what}`)
    },
    click: (re) =>
      page.ev(
        `(()=>{const re=${re.toString()};const b=[...document.querySelectorAll('button,[role=button]')].find(x=>re.test(x.innerText||x.getAttribute('aria-label')||''));if(!b)return false;b.click();return true})()`
      ),
    // O print é só registro: janela escondida ou tela bloqueada não desenham, e isso não derruba o passo.
    async shot(name) {
      try {
        const r = await send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'))
      } catch (error) {
        console.log(`sem print ${name}: ${error instanceof Error ? error.message : error}`)
      }
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

/** A área de transferência do sistema, lida de fora do app (cada sistema tem o seu comando); null se não der. */
function systemClipboard() {
  const tries =
    {
      win32: [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']]],
      darwin: [['pbpaste', []]],
      linux: [
        ['wl-paste', ['-n']],
        ['xclip', ['-selection', 'clipboard', '-o']],
        ['xsel', ['-b', '-o']]
      ]
    }[process.platform] ?? []
  for (const [cmd, args] of tries) {
    try {
      return execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000 }).trim()
    } catch {
      // sem esse comando
    }
  }
  return null
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
  await step('abre direto enviando, sem boas-vindas nem escolha de modo', async () => {
    const text = await app.waitText(/Aponte a câmera|Permitir o Notebook/, 30_000)
    if (/Começar|Este dispositivo vai/.test(text)) throw new Error('mostrou a tela antiga')
    await app.shot('01-enviar')
  })
  await step('o CSS sabe em que sistema roda (data-platform)', async () => {
    const platform = await app.ev('document.documentElement.dataset.platform')
    if (platform !== process.platform)
      throw new Error(`esperava ${process.platform}, veio ${platform}`)
    return platform
  })
  if (packaged) {
    await app.close()
    app = null
  }
  if (!packaged) {
    await step('envio completo: pedido, aprovar e o aparelho na lista de conectados', async () => {
      await app.waitText(/Permitir o Notebook/, 30_000)
      await app.click(/^Permitir$/)
      const text = await app.waitText(/tela conectada/, 30_000)
      if (!/Notebook/.test(text)) throw new Error('o aparelho não aparece na lista')
      if (!/Adicionar/.test(text))
        throw new Error(`sem o botão Adicionar ao conectar; tela: ${text.slice(0, 300)}`)
      await app.click(/Adicionar/)
      await app.waitText(/Mais um aparelho/)
      if ((await app.ev(`document.querySelector('.add').getAttribute('aria-expanded')`)) !== 'true')
        throw new Error('o Adicionar não abriu')
      await app.click(/^Fechar$/)
      // Conectado, a janela vai para o fundo e as animações de saída esperam ela voltar: confere o estado do botão.
      await app.until(
        `document.querySelector('.add').getAttribute('aria-expanded') === 'false'`,
        'o Adicionar fechar'
      )
      // Conectado, o Horizonte sai da frente e fica nos ícones ocultos. No Linux ele só minimiza (sem extensão não há
      // bandeja), e a CI não tem gerenciador de janelas para minimizar.
      if (process.platform !== 'linux') {
        const hidden = await app.ev('document.visibilityState')
        if (hidden !== 'hidden') throw new Error(`a janela continuou na frente (${hidden})`)
      }
    })
    await step(
      'com aparelho conectado, Receber nos Ajustes fica desligado (não derruba ninguém)',
      async () => {
        await app.click(/Ajustes/)
        const text = await app.waitText(/Receber a tela de outro computador/)
        if (!/Há aparelhos conectados/.test(text)) throw new Error('não avisou dos aparelhos')
        const off = await app.ev(
          `[...document.querySelectorAll('button')].find((b) => /Receber a tela de outro computador/.test(b.innerText))?.disabled`
        )
        if (off !== true) throw new Error('a linha Receber não ficou desligada')
        await app.click(/Voltar/)
        await app.waitText(/tela conectada/)
      }
    )
    await step('a tela de Enviar não tem o seletor Enviar/Receber', async () => {
      const has = await app.ev(`!!document.querySelector('[aria-label="Modo"]')`)
      if (has) throw new Error('o seletor ainda aparece na tela de Enviar')
      // Os outros usos ficam à vista na própria tela, desligados enquanto há aparelho conectado.
      const off = await app.ev(
        `[...document.querySelectorAll('.modes button')].map((b) => b.disabled).join()`
      )
      if (off !== 'true,true') throw new Error(`Receber e Mouse à vista, desligados: ${off}`)
    })
    await step('parar o aparelho e Receber pelos Ajustes vai direto para a lista', async () => {
      await app.click(/^Parar$/)
      const home = await app.waitText(/Aponte a câmera|Permitir o Notebook/, 30_000)
      if (/Permitir o Notebook/.test(home)) {
        await app.click(/^Recusar$/)
        await app.waitText(/Aponte a câmera/, 15_000)
      }
      // Na própria tela de Enviar, à vista (sem entrar nos Ajustes).
      await app.waitText(/Compartilhar mouse/)
      await app.click(/^Receber a tela$/)
      const text = await app.waitText(/Na sua rede/, 30_000)
      if (/Preparando|permissão/.test(text)) throw new Error('mostrou preparação no receptor')
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
    await step('ajustes: tema, nome, diagnóstico e GitHub', async () => {
      await app.click(/Ajustes/)
      const text = await app.waitText(/Aparência/i)
      for (const part of ['Escuro', 'Nome', 'Enviar diagnóstico', 'GitHub'])
        if (!text.toLowerCase().includes(part.toLowerCase()))
          throw new Error(`os Ajustes não têm "${part}"`)
      await app.click(/^120 fps$/)
      await app.until(
        `document.querySelector('[aria-label=Fluidez] .on')?.innerText.trim() === '120 fps'`,
        'escolher 120 fps'
      )
      await app.click(/^Escuro$/)
      await app.until(
        `[...document.querySelectorAll('[aria-label=Tema] .on')].some(b => b.innerText.trim() === 'Escuro')`,
        'escolher o tema Escuro'
      )
      await app.ev(`document.querySelector('details.changes').open = true`)
      if (!/O que mudou/.test(await app.ev('document.body.innerText')))
        throw new Error('os Ajustes não mostram o que mudou')
      await app.ev(`document.querySelector('details.changes').scrollIntoView({ block: 'center' })`)
      await app.shot('04b-o-que-mudou')
      // O envio automático de erros nasce desligado (só liga quem quiser) e fica ligado depois.
      const auto = `document.querySelector('[role=switch][aria-label="Enviar erros automaticamente"]')?.getAttribute('aria-checked')`
      if ((await app.ev(auto)) !== 'false')
        throw new Error('o envio automático devia nascer desligado')
      await app.click(/Enviar erros automaticamente/)
      await app.until(`(${auto}) === 'true'`, 'ligar o envio automático de erros')
      await app.click(/Desinstalar Horizonte/)
      await app.waitText(/não foi instalado por um instalador/)
      await app.shot('04-ajustes')
    })
    await app.close()

    // ---------- 2ª abertura: lembra o modo ----------
    app = await launch('2-lembra-receber')
    await step('reabrir: vai direto para Receber', async () => {
      await app.waitText(/Na sua rede/, 30_000)
      await app.shot('05-reabriu-receber')
    })
    await step('trocar para Enviar: o QR aparece', async () => {
      await app.click(/^Enviar$/)
      await app.waitText(/Aponte a câmera|Permitir o Notebook/, 30_000)
      await app.shot('06-enviar')
    })
    await step('reabrir: os Ajustes lembram 120 fps e o tema Escuro', async () => {
      // O aparelho de teste pede conexão logo que o Enviar abre: o Permitir cobriria os Ajustes. Recusa e segue.
      if (/Permitir o Notebook/.test(await app.ev('document.body.innerText'))) {
        await app.click(/^Recusar$/)
        await app.waitText(/Aponte a câmera/, 15_000)
      }
      await app.click(/Ajustes/)
      await app.waitText(/Fluidez/)
      if ((await app.pressed('120 fps')) !== 'true') throw new Error('a fluidez voltou ao padrão')
      if ((await app.pressed('Escuro')) !== 'true') throw new Error('o tema voltou ao padrão')
      const auto = await app.ev(
        `document.querySelector('[role=switch][aria-label="Enviar erros automaticamente"]')?.getAttribute('aria-checked')`
      )
      if (auto !== 'true') throw new Error('o envio automático de erros não ficou ligado')
      await app.click(/^60 fps$/)
      await app.click(/^Sistema$/)
      await app.click(/Voltar/)
      await app.waitText(/Aponte a câmera|Permitir o Notebook|tela conectada/, 15_000)
    })
    await step('idioma nos Ajustes: English troca a janela inteira e Português volta', async () => {
      if (/Permitir o Notebook/.test(await app.ev('document.body.innerText'))) {
        await app.click(/^Recusar$/)
        await app.waitText(/Aponte a câmera/, 15_000)
      }
      await app.click(/Ajustes/)
      await app.waitText(/Português/)
      await app.click(/^English$/)
      // A janela redesenha no idioma novo e os Ajustes continuam abertos.
      const text = await app.waitText(/Settings/, 15_000)
      for (const part of ['Back', 'Picture', 'Quality', 'Language'])
        if (!text.toLowerCase().includes(part.toLowerCase()))
          throw new Error(`em inglês, faltou "${part}"`)
      await app.shot('07-ajustes-ingles')
      await app.click(/^Português$/)
      await app.waitText(/Ajustes/, 15_000)
      await app.click(/Voltar/)
      await app.waitText(/Aponte a câmera|Permitir o Notebook|tela conectada/, 15_000)
    })
    await step('endereço na tela, sem código, e Copiar link leva ele', async () => {
      const text = await app.waitText(/Copiar link/, 30_000)
      const address = /(\d+\.\d+\.\d+\.\d+:\d+)(\/\d)?/.exec(text)
      if (!address) throw new Error(`sem endereço na tela: ${text.slice(0, 200)}`)
      if (address[2]) throw new Error(`o endereço ainda tem código: ${address[0]}`)
      const width = `Math.round(document.querySelector('.address').getBoundingClientRect().width)`
      const before = await app.ev(width)
      await app.click(/^Copiar link$/)
      await app.waitText(/Copiado/, 5000)
      const after = await app.ev(width)
      if (after !== before)
        throw new Error(`a barra mudou de largura ao copiar (${before} → ${after})`)
      const copied = systemClipboard()
      if (copied !== null && !copied.endsWith(address[1])) throw new Error(`copiou "${copied}"`)
      return copied ?? 'sem comando para ler a área de transferência'
    })
    await step('QR amplia ao clicar e volta no Esc e no toque', async () => {
      await app.click(/Ampliar o QR code/)
      await app.until(
        `!!document.querySelector('.qr-big svg, .qr-big canvas, .qr-big img')`,
        'o QR ampliar'
      )
      await app.shot('07-qr-grande')
      await app.ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      await app.until(`!document.querySelector('.qr-big')`, 'o Esc fechar o QR')
      await app.click(/Ampliar o QR code/)
      await app.until(`!!document.querySelector('.qr-big')`, 'o QR ampliar de novo')
      await app.click(/Fechar o QR ampliado/)
      await app.until(`!document.querySelector('.qr-big')`, 'o toque fechar o QR')
    })
  }
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
