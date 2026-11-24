import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERRORS, errorCodeFor, isErrorCode, type ErrorCode } from './errors'
import type { Lang } from './lang'

const LANGS: Lang[] = ['pt', 'en', 'es']
const codes = Object.keys(ERRORS) as ErrorCode[]

describe('catálogo de erros', () => {
  it('cada código tem título e o que fazer nos três idiomas, no mesmo jeito de escrever', () => {
    for (const code of codes) {
      expect(code).toMatch(/^\d{3}$/)
      for (const lang of LANGS) {
        const { title, fix } = { title: ERRORS[code].title[lang], fix: ERRORS[code].fix[lang] }
        // Título: o que aconteceu, curto e sem ponto (vira título de tela). O que fazer: frase com ponto final.
        expect(title, `${code} ${lang}`).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ¿]/)
        expect(title, `${code} ${lang}`).not.toMatch(/[.!]$/)
        expect(title.length, `${code} ${lang}`).toBeLessThanOrEqual(60)
        expect(fix, `${code} ${lang}`).toMatch(/\.$/)
        for (const text of [title, fix]) {
          expect(text, `${code} ${lang}`).not.toMatch(/—|\bErro\b|\bError\b|exception|stack/i)
        }
      }
    }
  })

  it('a causa conhecida vira o código certeiro; sem causa conhecida, o da operação', () => {
    expect(errorCodeFor('prepare', 'Não achei o monitor virtual no motor de transmissão.')).toBe(
      '201'
    )
    expect(errorCodeFor('prepare', 'O pacote do driver veio incompleto.')).toBe('202')
    expect(errorCodeFor('prepare', 'listen EADDRINUSE: address already in use :::47910')).toBe(
      '102'
    )
    expect(errorCodeFor('prepare', 'ENOSPC: no space left on device')).toBe('104')
    expect(errorCodeFor('prepare', "EACCES: permission denied, open 'settings.json'")).toBe('103')
    expect(errorCodeFor('answer', 'Esse pedido não está mais esperando resposta.')).toBe('305')
    expect(errorCodeFor('connect', 'O outro aparelho não respondeu ao pedido a tempo.')).toBe('302')
    expect(errorCodeFor('connect', 'O outro aparelho fechou a conexão.')).toBe('303')
    expect(errorCodeFor('connect', 'algo novo')).toBe('301')
    expect(errorCodeFor('mouse-start', 'algo novo')).toBe('402')
    expect(errorCodeFor(null, 'algo novo')).toBe('100')
  })

  it('cada causa conhecida da captura, da conexão e do mouse tem o seu código', () => {
    const cases: [string, string][] = [
      ['Permission denied', '205'],
      ['NotAllowedError: Permission denied by system', '205'],
      ['NotReadableError: Could not start video source', '206'],
      ['EncodingError: encoder initialization failed', '207'],
      ['A janela de transmissão parou (crashed).', '208'],
      ['ENOMEM: not enough memory', '108'],
      ['O firewall (ufw) está ligado e não foi liberado.', '109'],
      ['Os dois aparelhos estão com versões diferentes do Horizonte. Atualize os dois.', '310'],
      ['O outro aparelho já está mostrando a tela em outro lugar.', '311'],
      ['O outro aparelho não permitiu a conexão.', '312'],
      ['10.0.0.2 não está esperando conexão. Escolha Enviar no outro aparelho.', '309'],
      ['Não achei caminho de rede até o outro aparelho.', '307'],
      ['A conexão caiu.', '308'],
      ['Arraste um computador para perto deste.', '404'],
      ['O arquivo chegou incompleto.', '405'],
      ['Mesa ainda não consegue compartilhar o mouse.', '406'],
      [
        'Nenhum computador respondeu. Confira se o Horizonte está aberto no modo Mouse neles.',
        '407'
      ]
    ]
    for (const [cause, code] of cases) expect(errorCodeFor('connect', cause), cause).toBe(code)
    // Erro de arquivo com "permission denied" continua sendo o de arquivo, não o da captura.
    expect(errorCodeFor('prepare', "EACCES: permission denied, open 'a'")).toBe('103')
    expect(errorCodeFor('capture', 'algo novo')).toBe('206')
  })

  it('só código do catálogo passa como código', () => {
    expect(isErrorCode('201')).toBe(true)
    for (const bad of ['999', 'HZ-201', 'hz-201', '20', 'toString', '__proto__', 42, null]) {
      expect(isErrorCode(bad)).toBe(false)
    }
  })

  it('a página do navegador antigo (legado.js, sem build) usa os mesmos textos do catálogo', () => {
    const legacy = readFileSync(resolve('src/renderer/public/legado.js'), 'utf8')
    const used = [...legacy.matchAll(/'(\d{3})'/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const code of new Set(used)) {
      expect(isErrorCode(code), code).toBe(true)
      for (const lang of LANGS)
        for (const text of [
          ERRORS[code as ErrorCode].title[lang],
          ERRORS[code as ErrorCode].fix[lang]
        ])
          expect(legacy, `${code} ${lang}`).toContain(`'${text}'`)
    }
  })
})

// A tabela do site: gerada daqui. `UPDATE_SITE_ERRORS=1 npx vitest run src/shared/errors.test.ts` reescreve.
const AREAS: Record<string, Record<Lang, string>> = {
  '1': { pt: 'Este computador', en: 'This computer', es: 'Esta computadora' },
  '2': { pt: 'Tela estendida', en: 'Extended screen', es: 'Pantalla extendida' },
  '3': { pt: 'Conexão', en: 'Connection', es: 'Conexión' },
  '4': { pt: 'Mouse compartilhado', en: 'Shared mouse', es: 'Mouse compartido' },
  '5': { pt: 'Atualizações', en: 'Updates', es: 'Actualizaciones' },
  '6': {
    pt: 'Receber pelo navegador',
    en: 'Receiving in the browser',
    es: 'Recibir en el navegador'
  }
}
const UI: Record<Lang, Record<string, unknown>> = {
  pt: {
    pageTitle: 'Códigos de erro · Horizonte',
    h1: 'Códigos de erro',
    lede: 'Cada erro do Horizonte vem com um código. Ache o seu aqui e veja como resolver. Se não resolver, envie o diagnóstico nos Ajustes do app.',
    back: 'Voltar para o início',
    cols: { code: 'Código', what: 'O que aconteceu', fix: 'Como resolver' }
  },
  en: {
    pageTitle: 'Error codes · Horizonte',
    h1: 'Error codes',
    lede: 'Every Horizonte error comes with a code. Find yours here and see how to fix it. If it does not help, send the diagnostic in the app Settings.',
    back: 'Back to home',
    cols: { code: 'Code', what: 'What happened', fix: 'How to fix' }
  },
  es: {
    pageTitle: 'Códigos de error · Horizonte',
    h1: 'Códigos de error',
    lede: 'Cada error de Horizonte trae un código. Encuentra el tuyo aquí y mira cómo resolverlo. Si no se resuelve, envía el diagnóstico en los Ajustes de la app.',
    back: 'Volver al inicio',
    cols: { code: 'Código', what: 'Qué pasó', fix: 'Cómo resolverlo' }
  }
}

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderPage(): string {
  const data = {
    ui: Object.fromEntries(
      LANGS.map((lang) => [
        lang,
        {
          ...UI[lang],
          areas: Object.fromEntries(Object.entries(AREAS).map(([key, text]) => [key, text[lang]]))
        }
      ])
    ),
    codes: Object.fromEntries(
      codes.map((code) => [
        code,
        Object.fromEntries(
          LANGS.map((lang) => [lang, [ERRORS[code].title[lang], ERRORS[code].fix[lang]]])
        )
      ])
    )
  }
  const pt = UI.pt as {
    pageTitle: string
    h1: string
    lede: string
    back: string
    cols: Record<string, string>
  }
  const groups = Object.keys(AREAS)
    .map((area) => {
      const rows = codes
        .filter((code) => code.charAt(0) === area)
        .map(
          (code) =>
            `        <tr id="${code}"><td class="code">${code}</td><td class="what">${escape(ERRORS[code].title.pt)}</td><td class="fix">${escape(ERRORS[code].fix.pt)}</td></tr>`
        )
        .join('\n')
      return `    <h2 data-area="${area}">${AREAS[area].pt}</h2>
    <table>
      <thead><tr><th data-col="code">${pt.cols.code}</th><th data-col="what">${pt.cols.what}</th><th data-col="fix">${pt.cols.fix}</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`
    })
    .join('\n')
  return `<!doctype html>
<!-- Gerado por app/src/shared/errors.test.ts a partir do catálogo (app/src/shared/errors.ts). Não edite à mão. -->
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${pt.pageTitle}</title>
    <meta name="description" content="Os códigos de erro do Horizonte (número de 3 dígitos): o que cada um quer dizer e como resolver.">
    <link rel="canonical" href="https://horizonte-monitor.vercel.app/erros">
    <link rel="icon" href="./favicon.svg" type="image/svg+xml">
    <style>
      :root { --bg: #f2f2f7; --fg: #000; --muted: #6e6e73; --line: #d2d2d7; --mark: rgba(0, 122, 255, 0.12); --link: #007aff; color-scheme: light dark; }
      @media (prefers-color-scheme: dark) { :root { --bg: #000; --fg: #fff; --muted: #98989d; --line: #38383a; --mark: rgba(10, 132, 255, 0.22); --link: #0a84ff; } }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.47 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      main { max-width: 860px; margin: 0 auto; padding: 48px 16px 80px; }
      h1 { font-size: 40px; line-height: 1.1; margin: 0 0 12px; letter-spacing: -0.02em; }
      .lede { color: var(--muted); margin: 0 0 32px; max-width: 60ch; }
      h2 { font-size: 21px; margin: 40px 0 8px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 13px; font-weight: 600; color: var(--muted); padding: 8px 12px 8px 0; border-bottom: 1px solid var(--line); }
      td { vertical-align: top; padding: 12px 12px 12px 0; border-bottom: 1px solid var(--line); }
      td.code { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
      td.what { font-weight: 600; }
      td.fix { color: var(--muted); }
      tr:target td { background: var(--mark); }
      a { color: var(--link); }
      @media (max-width: 600px) { thead { display: none; } tr { display: block; padding: 12px 0; border-bottom: 1px solid var(--line); } td { display: block; border: 0; padding: 2px 0; } }
    </style>
  </head>
  <body>
  <main>
    <p><a class="back" href="./">${pt.back}</a></p>
    <h1>${pt.h1}</h1>
    <p class="lede">${pt.lede}</p>
${groups}
  </main>
  <script type="application/json" id="erros-dados">${JSON.stringify(data)}</script>
  <script src="./js/erros.js"></script>
  </body>
</html>
`
}

it('a tabela do site (site/erros.html) está igual ao catálogo', () => {
  const file = resolve('../site/erros.html')
  const page = renderPage()
  if (process.env.UPDATE_SITE_ERRORS === '1') writeFileSync(file, page)
  expect(readFileSync(file, 'utf8')).toBe(page)
})
