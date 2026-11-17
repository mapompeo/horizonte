import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer as createSocket } from 'node:net'
import { createServer } from 'vite'
const { chromium } = createRequire(new URL('../../site/package.json', import.meta.url))(
  '@playwright/test'
)
const port = await new Promise((resolve, reject) => {
  const socket = createSocket()
  socket.on('error', reject)
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port
    socket.close(() => resolve(port))
  })
})
const server = await createServer({
  configFile: 'vite.demo.config.ts',
  server: { port, strictPort: true, host: '127.0.0.1' }
})
await server.listen()
const url = `http://127.0.0.1:${server.httpServer.address().port}`
console.log(`Teste local: ${url}`)
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`${url}/?auto=0`)
  await page.getByRole('heading', { name: 'Aponte a câmera' }).waitFor()
  await page.evaluate(async () => {
    await window.__demo.reset({
      screen: 'error',
      mode: 'send',
      error: { message: 'Falha de teste' }
    })
    window.reportCalls = 0
    window.horizonte.reportDiagnostic = async () => {
      window.reportCalls++
      throw new Error('rede')
    }
  })
  const button = page.getByRole('button', { name: /diagnóstico|Tentar de novo/ })
  await button.click()
  await page.getByText('Não deu para enviar. Tentar de novo').waitFor()
  await page.evaluate(() => {
    window.horizonte.reportDiagnostic = async () => {
      window.reportCalls++
    }
  })
  await page.getByRole('button', { name: 'Não deu para enviar. Tentar de novo' }).click()
  await page.getByText('Diagnóstico enviado. Obrigado').waitFor()
  assert.equal(await page.evaluate(() => window.reportCalls), 2)
  console.log('Um clique: falha com tentar de novo e envio confirmado: OK')
} finally {
  await browser.close()
  await server.close()
}
