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
  await page.getByRole('heading', { name: 'Pronto.' }).waitFor()
  await page.evaluate(async () => {
    await window.__demo.reset({
      screen: 'error',
      mode: 'send',
      error: { message: 'Falha de teste' }
    })
    window.reportCalls = []
    window.horizonte.getDiagnosticDraft = async (history) =>
      history ? 'Horizonte 1\nTela: error\nHistórico revisado' : 'Horizonte 1\nTela: error'
    window.horizonte.reportDiagnostic = async (text) => {
      window.reportCalls.push(text)
      return 'copied'
    }
  })
  await page.getByRole('button', { name: 'Enviar diagnóstico', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  assert.match(await dialog.textContent(), /pública/)
  assert.match(await dialog.textContent(), /entrar no GitHub/)
  assert.equal(await page.evaluate(() => window.reportCalls.length), 0)
  assert.equal(await dialog.getByRole('textbox').inputValue(), 'Horizonte 1\nTela: error')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  assert.equal(await page.evaluate(() => window.reportCalls.length), 0)
  await page.getByRole('button', { name: 'Enviar diagnóstico', exact: true }).click()
  await dialog.getByRole('checkbox').check()
  await page.waitForFunction(() =>
    document.querySelector('#report-text').value.includes('Histórico revisado')
  )
  await dialog.getByRole('button', { name: 'Abrir issue no GitHub' }).click()
  await dialog.getByText(/Cole o texto/).waitFor()
  assert.deepEqual(await page.evaluate(() => window.reportCalls), [
    'Horizonte 1\nTela: error\nHistórico revisado'
  ])
  await page.evaluate(() => {
    window.horizonte.reportDiagnostic = async () => {
      throw new Error('navegador')
    }
  })
  await dialog.getByRole('button', { name: 'Abrir issue no GitHub' }).click()
  await dialog.getByText(/Não consegui abrir/).waitFor()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await page.evaluate(() => {
    window.horizonte.getDiagnosticDraft = async () => {
      throw new Error('consulta')
    }
  })
  await page.getByRole('button', { name: 'Enviar diagnóstico', exact: true }).click()
  await dialog.getByText(/Não consegui preparar/).waitFor()
  assert.equal(
    await dialog.getByRole('button', { name: 'Abrir issue no GitHub' }).isDisabled(),
    true
  )
  console.log('Revisão, cancelamento, histórico opcional, fallback e rejeições: OK')
} finally {
  await browser.close()
  await server.close()
}
