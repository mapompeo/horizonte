import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// i18n.js é script clássico (sem import/export); aqui ele roda sem DOM e entrega as funções por module.exports.
const mod = { exports: {} }
new Function('module', readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8'))(mod)
const { pickLang, fromNavigator, DICT } = mod.exports
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const keys = new Set(['meta.title', 'lang.group', 'lang.cycle'])
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1])
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) keys.add(pair.slice(pair.indexOf(':') + 1))
for (const file of readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'i18n.js')) {
  const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8')
  for (const m of src.matchAll(/["']((?:file|dl|copy|iframe|ap)\.[A-Za-z0-9]+)["']/g)) keys.add(m[1])
}

test('toda chave do HTML e dos scripts existe em en e es, sem vazio nem travessão', () => {
  assert.ok(keys.size > 100)
  for (const lang of ['en', 'es']) {
    for (const key of keys) {
      const value = DICT[lang][key]
      assert.equal(typeof value, 'string', `${lang}: falta ${key}`)
      assert.ok(value.trim().length > 0, `${lang}: ${key} vazio`)
      assert.ok(!value.includes('—'), `${lang}: ${key} com travessão`)
    }
  }
  assert.deepEqual(Object.keys(DICT.en).sort(), Object.keys(DICT.es).sort())
})

test('o inglês e o espanhol não deixam sobra sem uso', () => {
  for (const key of Object.keys(DICT.en)) assert.ok(keys.has(key), `chave sem uso: ${key}`)
})

test('escolha do idioma: ?lang > guardado > navegador', () => {
  assert.equal(fromNavigator(['pt-BR']), 'pt')
  assert.equal(fromNavigator(['es-MX']), 'es')
  assert.equal(fromNavigator(['fr-FR']), 'en')
  assert.equal(fromNavigator([]), 'en')
  assert.equal(pickLang(null, null, ['pt-BR']), 'pt')
  assert.equal(pickLang(null, 'es', ['pt-BR']), 'es')
  assert.equal(pickLang('en', 'es', ['pt-BR']), 'en')
  assert.equal(pickLang('xx', null, ['es-MX']), 'es')
})

test('hreflang no HTML e no sitemap', () => {
  for (const lang of ['pt-BR', 'en', 'es', 'x-default']) assert.match(html, new RegExp(`hreflang="${lang}"`))
  const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8')
  assert.equal((sitemap.match(/<url>/g) || []).length, 3)
  assert.match(sitemap, /hreflang="es" href="https:\/\/horizonte-monitor\.vercel\.app\/\?lang=es"/)
})
