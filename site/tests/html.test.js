import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

test('idioma, título, descrição e imagem de compartilhamento', () => {
  assert.match(html, /<html lang="pt-BR">/)
  assert.match(html, /<title>Horizonte<\/title>/)
  assert.match(html, /<meta name="description" content="[^"]{60,160}">/)
  assert.match(html, /<meta property="og:image" content="https:\/\/mapompeo\.github\.io\/horizonte\/og\.png">/)
  assert.match(html, /<link rel="canonical" href="https:\/\/mapompeo\.github\.io\/horizonte\/">/)
})

test('sem JavaScript: links de download funcionam e nada nasce escondido', () => {
  for (const os of ['windows', 'linux', 'mac']) {
    assert.match(html, new RegExp(`data-dl="${os}"[^>]*href="https://github.com/mapompeo/horizonte/releases"|href="https://github.com/mapompeo/horizonte/releases"[^>]*data-dl="${os}"`))
  }
  assert.doesNotMatch(html, /style="[^"]*(opacity:\s*0|display:\s*none|visibility:\s*hidden)/)
  assert.doesNotMatch(html, /\shidden[\s>]/)
})

test('só carrega coisas do próprio site', () => {
  const sources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  const external = sources.filter((s) => /^https?:/.test(s) && !s.startsWith('https://github.com/mapompeo/horizonte') && !s.startsWith('https://mapompeo.github.io/horizonte/'))
  assert.deepEqual(external, [])
  assert.match(html, /<script src="\.\/vendor\/motion\.min\.js"><\/script>/)
  assert.match(html, /<script type="module" src="\.\/js\/main\.js"><\/script>/)
})

test('textos sem travessão e sem o seletor de tema da prévia', () => {
  assert.doesNotMatch(html, /—/)
  assert.doesNotMatch(html, /theme-dock|Prévia/)
  assert.doesNotMatch(css, /theme-dock/)
})

test('números e estados vistos funcionando, nada além', () => {
  assert.match(html, /data-count="60"/)
  assert.match(html, /data-count="23"/)
  assert.match(html, /data-count="3"/)
  assert.match(html, /data-os="linux"[\s\S]*?Em teste/)
  assert.match(html, /data-os="mac"[\s\S]*?Em teste/)
  assert.match(html, /data-os="windows"[\s\S]*?Disponível/)
})

test('menos movimento é tratado no CSS', () => {
  assert.match(css, /\.motion \.story/)
  assert.match(css, /\.motion \.sticky/)
})

test('estrutura inteira: uma página, um rodapé, três cartões de download', () => {
  const count = (re) => (html.match(re) || []).length
  assert.equal(count(/<main\b/g), 1)
  assert.equal(count(/<\/main>/g), 1)
  assert.equal(count(/<footer>/g), 1)
  assert.equal(count(/<\/footer>/g), 1)
  assert.equal(count(/data-dl="/g), 3)
  assert.equal(count(/data-dl-meta="/g), 3)
  assert.equal(count(/class="spec-line"/g), 1)
  assert.match(html, /<\/footer>\s*<script src="\.\/vendor\/motion\.min\.js"><\/script>/)
})

test('imagem de compartilhamento, robots e sitemap existem', () => {
  const og = new URL('../og.png', import.meta.url)
  assert.ok(existsSync(og))
  assert.ok(statSync(og).size > 10_000)
  const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8')
  assert.match(robots, /Sitemap: https:\/\/mapompeo\.github\.io\/horizonte\/sitemap\.xml/)
  const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8')
  assert.match(sitemap, /<loc>https:\/\/mapompeo\.github\.io\/horizonte\/<\/loc>/)
})
