// Faz o papel do tablet (é um app Electron à parte): abre a página de receber pelo navegador num Chromium escondido,
// digita o código e espera o vídeo andar. Uso: electron e2e/web-check <url> <código>. Sai com 0 quando o vídeo chega.
const { app, BrowserWindow } = require('electron')
const { appendFileSync } = require('node:fs')

// O console de um app Electron nem sempre chega ao terminal no Windows: o registro vai também para um arquivo.
const trace = (message) => {
  console.log(`[motor] navegador: ${message}`)
  if (process.env.HZ_WEB_TRACE) appendFileSync(process.env.HZ_WEB_TRACE, `${message}\n`)
}
trace(`abriu (${process.argv.length} argumentos)`)

process.on('unhandledRejection', (error) => {
  trace(`erro ${error instanceof Error ? error.message : String(error)}`)
  app.exit(1)
})

app.whenReady().then(async () => {
  const at = process.argv.findIndex((arg) => /web-check[\\/]?$/.test(arg))
  const [url, code] = process.argv.slice(at + 1)
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 640,
    webPreferences: { offscreen: true }
  })
  trace(`abrindo ${url}`)
  await win.loadURL(url)
  const run = (js) => win.webContents.executeJavaScript(js)
  await run(`document.getElementById('codigo').value = ${JSON.stringify(code)}
    document.getElementById('form').requestSubmit()`)
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const video = await run(`(() => {
      const v = document.querySelector('video')
      return v && v.videoWidth > 0 && v.currentTime > 0.5 ? v.videoWidth + 'x' + v.videoHeight : null
    })()`)
    if (video) {
      trace(`vídeo ${video}`)
      app.exit(0)
      return
    }
  }
  console.log(
    `[motor] navegador: sem vídeo (${await run(`document.getElementById('texto').textContent`)})`
  )
  app.exit(1)
})
