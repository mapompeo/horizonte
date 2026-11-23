import { expect, it } from 'vitest'
import { buildReportFile, lastLines, reportFileName } from './report-file'

const facts = {
  version: '0.2.0-beta.96',
  system: 'Windows 10.0.19045 x64',
  memory: '5.8 GB, 1.2 GB livres',
  cpu: 'Intel Core i5',
  gpu: 'Intel UHD 620',
  displays: ['1920x1080 escala 1.25 (principal)', '2560x1080 escala 1'],
  state: 'connected (modo send)',
  settings: '30 Mbps, 60 fps'
}

it('relatório: o computador em cima, o final de cada log embaixo, sem a pasta pessoal nem senhas', () => {
  const text = buildReportFile(
    facts,
    [
      {
        name: 'app.log',
        text: 'linha velha\n[motor] erro em C:\\Users\\Junior\\AppData\\x\ncurl https://user:segredo@host\n'
      },
      { name: 'navegador.log', text: null }
    ],
    'C:\\Users\\Junior',
    new Date('2026-11-23T12:00:00Z')
  )
  expect(text.split('\n')[0]).toBe('Horizonte 0.2.0-beta.96')
  expect(text).toContain('Telas: 1920x1080 escala 1.25 (principal) | 2560x1080 escala 1')
  expect(text).toContain('===== app.log (últimas linhas) =====')
  expect(text).toContain('[motor] erro em ~\\AppData\\x')
  expect(text).not.toContain('Junior')
  expect(text).not.toContain('segredo')
  expect(text).toContain('===== navegador.log (últimas linhas) =====\n(vazio ou não existe)')
})

it('só as últimas linhas de cada log', () => {
  const big = Array.from({ length: 1000 }, (_, i) => `linha ${i}`).join('\n') + '\n'
  const tail = lastLines(big, 3)
  expect(tail).toBe('linha 997\nlinha 998\nlinha 999')
})

it('nome do arquivo com data e hora', () => {
  expect(reportFileName(new Date(2026, 10, 23, 9, 5))).toBe(
    'Horizonte-relatorio-2026-11-23-0905.txt'
  )
})

it('texto público: sem nome do computador, do usuário, dos aparelhos .local nem o fim dos IPs', () => {
  const text = buildReportFile(
    facts,
    [
      {
        name: 'navegador.log',
        text: 'PC-DO-JUNIOR conectou de 192.168.0.114 e ipad-de-junior-dias.local; usuário junior\n'
      }
    ],
    '/home/junior',
    new Date(),
    ['PC-DO-JUNIOR', 'junior']
  )
  expect(text).toContain('[oculto] conectou de 192.168.x.x e [aparelho].local; usuário [oculto]')
  expect(text).not.toMatch(/junior|114/i)
})

it('logs enormes: menos linhas de cada um até caber numa issue do GitHub', () => {
  const huge = Array.from({ length: 5000 }, (_, i) => `linha ${i} ${'x'.repeat(80)}`).join('\n')
  const text = buildReportFile(facts, [{ name: 'app.log', text: huge }], '/home/a')
  expect(text.length).toBeLessThanOrEqual(60_000)
  expect(text).toContain('linha 4999')
})
