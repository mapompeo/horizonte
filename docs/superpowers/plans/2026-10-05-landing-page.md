# Landing page do Horizonte: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publicar em `site/` a landing page de descoberta do Horizonte, igual à prévia aprovada, com o download lendo a última release do GitHub e publicação automática pelo GitHub Pages.

**Architecture:** página estática sem etapa de build. A lógica que dá para testar fica em módulos JavaScript puros (`site/js/os.js`, `site/js/releases.js`, `site/js/story.js`), testados com o executor nativo do Node (`node --test`). A cola com a página (`site/js/main.js`) e as animações (`site/js/scenes.js`) usam esses módulos. O HTML e o CSS são portados da prévia aprovada, que está no repositório.

**Tech Stack:** HTML, CSS e JavaScript (módulos ES) puros; Motion 12.43.0 guardada em `site/vendor/`; testes com `node --test` (Node 22); GitHub Pages por Actions.

**Spec:** `docs/superpowers/specs/2026-10-05-landing-page-design.md`
**Prévia aprovada (referência de visual e movimento):** `docs/superpowers/specs/2026-10-05-landing-prototipo.html`

## Global Constraints

- Única dependência de execução: Motion 12.43.0, arquivo `motion.min.js` guardado em `site/vendor/` com o aviso de licença MIT. Nada é carregado de outro domínio na hora, exceto a leitura da API pública do GitHub.
- Sem framework e sem etapa de build: o que está em `site/` é exatamente o que é publicado.
- Texto em português do Brasil, sem travessão (`—`) em nenhum texto.
- Fontes do sistema, sem fonte externa.
- Tema claro e escuro automáticos pelo sistema, sem seletor na página.
- Animação só com `transform`, `opacity` e `filter`; tudo para com `prefers-reduced-motion`.
- Sem JavaScript ou com menos movimento, a página fica inteira legível e os links de download funcionam (apontam para `https://github.com/mapompeo/horizonte/releases`).
- Números só os medidos no teste de 05/10/2026: 60 fps, 23 Mbps (Wi-Fi 5 GHz, placa de vídeo), 3 cliques.
- Linux e macOS sempre marcados como "Em teste"; Windows como "Disponível".
- Lighthouse 95 ou mais em desempenho, acessibilidade, melhores práticas e SEO, no celular e no computador.
- A CI existente do app (`.github/workflows/ci.yml`) não roda por mudanças só em `site/`.

## Review Focus

- **API do GitHub fora do ar ou no limite de uso:** os links continuam apontando para a página de releases e os textos fixos do HTML continuam na tela, sem erro visível. Teste em `buildDownloads` com lista vazia e no `loadReleases` com `fetch` que falha (Tarefa 2).
- **Release sem o arquivo de um sistema** (por exemplo, sem `.dmg`): o cartão desse sistema aponta para a página da release, não para um link quebrado. Teste em `buildDownloads` (Tarefa 2).
- **Só rascunhos ou lista vazia de releases:** nada é trocado na página. Teste em `pickLatest` (Tarefa 2).
- **Rolar para trás ou pular para o meio da história** (clicar em "Como funciona" no topo ou recarregar no meio): a cena é sempre a da posição atual, sem pular cena nem índice fora do intervalo. Teste em `chapterAt` com 0, 1, valores negativos e acima de 1 (Tarefa 3).
- **Sem JavaScript:** a página é legível e nenhum elemento nasce escondido no HTML. Teste estático do `index.html` (Tarefa 4).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `site/package.json` | Marca a pasta como módulos ES e define `npm test` (sem dependências) |
| `site/js/os.js` | Detectar o sistema pelo user agent |
| `site/js/releases.js` | Escolher a última release, montar os downloads por sistema, ler a API |
| `site/js/story.js` | Contas da história: cena atual, posição da janela, Mbps |
| `site/js/main.js` | Cola: sistema da pessoa, downloads na página, liga as animações |
| `site/js/scenes.js` | Todas as animações com a Motion (portadas da prévia) |
| `site/index.html` | Marcação da página (portada da prévia) |
| `site/styles.css` | Estilos (portados da prévia, sem o seletor de tema) |
| `site/icon.png`, `site/og.png` | Ícone e imagem de compartilhamento |
| `site/robots.txt`, `site/sitemap.xml` | Para buscadores |
| `site/vendor/motion.min.js`, `site/vendor/LICENSE-motion.txt` | Biblioteca de animação guardada |
| `site/tests/*.test.js` | Testes dos módulos puros e do HTML |
| `.github/workflows/pages.yml` | Testa e publica `site/` no GitHub Pages |
| `.github/workflows/ci.yml` | Ganha `paths-ignore` para `site/**` |
| `README.md` (raiz) | Nome, frase, imagem, link para a landing, instalar, contribuir |

O endereço publicado será `https://mapompeo.github.io/horizonte/`. Todos os caminhos dentro de `site/` são relativos (`./styles.css`, `./js/main.js`), para funcionar nesse subcaminho.

---

### Tarefa 1: Estrutura de `site/` e detecção do sistema

**Files:**
- Create: `site/package.json`
- Create: `site/js/os.js`
- Test: `site/tests/os.test.js`

**Interfaces:**
- Produces: `detectOs(userAgent: string): 'windows' | 'linux' | 'mac'` e `OS_LABEL: { windows: 'Windows', linux: 'Linux', mac: 'macOS' }`.

- [ ] **Passo 1: Criar `site/package.json`**

```json
{
  "name": "horizonte-site",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.js\""
  }
}
```

- [ ] **Passo 2: Escrever o teste que falha**

`site/tests/os.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectOs, OS_LABEL } from '../js/os.js'

test('Windows é o padrão, inclusive para user agent vazio ou desconhecido', () => {
  assert.equal(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows')
  assert.equal(detectOs(''), 'windows')
  assert.equal(detectOs('algo estranho'), 'windows')
})

test('reconhece macOS, iPhone e iPad como mac', () => {
  assert.equal(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)'), 'mac')
  assert.equal(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mac')
  assert.equal(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'mac')
})

test('reconhece Linux, Android e ChromeOS como linux', () => {
  assert.equal(detectOs('Mozilla/5.0 (X11; Linux x86_64)'), 'linux')
  assert.equal(detectOs('Mozilla/5.0 (Linux; Android 14)'), 'linux')
  assert.equal(detectOs('Mozilla/5.0 (X11; CrOS x86_64 15000.0.0)'), 'linux')
})

test('os nomes mostrados na página', () => {
  assert.deepEqual(OS_LABEL, { windows: 'Windows', linux: 'Linux', mac: 'macOS' })
})
```

- [ ] **Passo 3: Rodar e ver falhar**

Run: `cd site && npm test`
Expected: FAIL, `Cannot find module '../js/os.js'`.

- [ ] **Passo 4: Implementar**

`site/js/os.js`:

```js
/** Só para destacar o botão certo; nada sai do navegador. */
export const OS_LABEL = { windows: 'Windows', linux: 'Linux', mac: 'macOS' }

export function detectOs(userAgent) {
  const ua = String(userAgent ?? '')
  if (/Mac|iPhone|iPad/.test(ua)) return 'mac'
  if (/Linux|Android|CrOS/.test(ua)) return 'linux'
  return 'windows'
}
```

- [ ] **Passo 5: Rodar e ver passar**

Run: `cd site && npm test`
Expected: PASS, 4 testes.

- [ ] **Passo 6: Commit**

```bash
git add site/package.json site/js/os.js site/tests/os.test.js
git commit -m "feat(site): estrutura da landing e detecção do sistema"
```

---

### Tarefa 2: Downloads a partir da última release

**Files:**
- Create: `site/js/releases.js`
- Test: `site/tests/releases.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `RELEASES_PAGE = 'https://github.com/mapompeo/horizonte/releases'`
  - `pickLatest(releases: Release[]): Release | null`: ignora rascunhos, aceita pré-lançamentos, escolhe o `published_at` mais recente.
  - `formatVersion(tag: string): string`: `'v0.1.0-beta.4'` vira `'0.1.0 beta 4'`; `'v1.2.0'` vira `'1.2.0'`.
  - `buildDownloads(release: Release | null): Downloads`, onde `Downloads = { version: string | null, windows: Entry, linux: Entry, mac: Entry }` e `Entry = { href: string, files: { name: string, mb: number }[] }`. Sem arquivo para o sistema, `href` é a página da release (ou `RELEASES_PAGE` sem release) e `files` é `[]`.
  - `loadReleases(fetchFn = fetch): Promise<Release[]>`: devolve `[]` em qualquer falha.
  - `Release` é o objeto da API do GitHub; só usamos `draft`, `published_at`, `tag_name`, `html_url` e `assets[].{ name, size, browser_download_url }`.

- [ ] **Passo 1: Escrever os testes que falham**

`site/tests/releases.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RELEASES_PAGE, buildDownloads, formatVersion, loadReleases, pickLatest } from '../js/releases.js'

const asset = (name, size) => ({ name, size, browser_download_url: `https://dl/${name}` })
const release = (tag, published, extra = {}) => ({
  tag_name: tag,
  published_at: published,
  draft: false,
  html_url: `https://github.com/mapompeo/horizonte/releases/tag/${tag}`,
  assets: [
    asset('Horizonte-0.1.0-setup.exe', 110242450),
    asset('Horizonte-0.1.0.AppImage', 124994332),
    asset('Horizonte-0.1.0.deb', 99184168),
    asset('horizonte-0.1.0.dmg', 127620512)
  ],
  ...extra
})

test('pickLatest escolhe a mais recente, mesmo sendo pré-lançamento', () => {
  const list = [
    release('v0.1.0-beta.3', '2026-10-05T14:00:00Z', { prerelease: true }),
    release('v0.1.0-beta.4', '2026-10-05T15:30:00Z', { prerelease: true }),
    release('v0.1.0-beta.1', '2026-10-05T09:00:00Z', { prerelease: true })
  ]
  assert.equal(pickLatest(list).tag_name, 'v0.1.0-beta.4')
})

test('pickLatest ignora rascunhos e devolve null sem nada publicado', () => {
  assert.equal(pickLatest([]), null)
  assert.equal(pickLatest([release('v9', '2030-01-01T00:00:00Z', { draft: true })]), null)
  assert.equal(pickLatest(null), null)
  const list = [release('v2', '2030-01-01T00:00:00Z', { draft: true }), release('v1', '2026-01-01T00:00:00Z')]
  assert.equal(pickLatest(list).tag_name, 'v1')
})

test('formatVersion deixa a versão legível', () => {
  assert.equal(formatVersion('v0.1.0-beta.4'), '0.1.0 beta 4')
  assert.equal(formatVersion('v1.2.0'), '1.2.0')
  assert.equal(formatVersion('0.3.0-rc.2'), '0.3.0 rc 2')
})

test('buildDownloads monta os arquivos de cada sistema com o tamanho em MB', () => {
  const d = buildDownloads(release('v0.1.0-beta.4', '2026-10-05T15:30:00Z'))
  assert.equal(d.version, '0.1.0 beta 4')
  assert.equal(d.windows.href, 'https://dl/Horizonte-0.1.0-setup.exe')
  assert.deepEqual(d.windows.files, [{ name: 'Horizonte-0.1.0-setup.exe', mb: 110 }])
  assert.equal(d.linux.href, 'https://dl/Horizonte-0.1.0.AppImage')
  assert.deepEqual(d.linux.files.map((f) => f.name), ['Horizonte-0.1.0.AppImage', 'Horizonte-0.1.0.deb'])
  assert.equal(d.mac.href, 'https://dl/horizonte-0.1.0.dmg')
  assert.deepEqual(d.mac.files, [{ name: 'horizonte-0.1.0.dmg', mb: 128 }])
})

test('sistema sem arquivo na release aponta para a página da release', () => {
  const r = release('v0.2.0', '2026-11-01T00:00:00Z')
  r.assets = r.assets.filter((a) => !a.name.endsWith('.dmg'))
  const d = buildDownloads(r)
  assert.equal(d.mac.href, r.html_url)
  assert.deepEqual(d.mac.files, [])
  assert.equal(d.windows.href, 'https://dl/Horizonte-0.1.0-setup.exe')
})

test('sem release, tudo aponta para a página de releases', () => {
  const d = buildDownloads(null)
  assert.equal(d.version, null)
  for (const os of ['windows', 'linux', 'mac']) {
    assert.equal(d[os].href, RELEASES_PAGE)
    assert.deepEqual(d[os].files, [])
  }
})

test('loadReleases devolve lista vazia quando a API falha, responde erro ou manda lixo', async () => {
  assert.deepEqual(await loadReleases(async () => { throw new Error('offline') }), [])
  assert.deepEqual(await loadReleases(async () => ({ ok: false, json: async () => ({}) })), [])
  assert.deepEqual(await loadReleases(async () => ({ ok: true, json: async () => ({ message: 'rate limit' }) })), [])
})

test('loadReleases devolve a lista quando a API responde', async () => {
  const list = [release('v1', '2026-01-01T00:00:00Z')]
  let asked = ''
  const got = await loadReleases(async (url) => {
    asked = url
    return { ok: true, json: async () => list }
  })
  assert.equal(asked, 'https://api.github.com/repos/mapompeo/horizonte/releases?per_page=10')
  assert.equal(got.length, 1)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd site && npm test`
Expected: FAIL, `Cannot find module '../js/releases.js'`.

- [ ] **Passo 3: Implementar**

`site/js/releases.js`:

```js
export const RELEASES_PAGE = 'https://github.com/mapompeo/horizonte/releases'
const API = 'https://api.github.com/repos/mapompeo/horizonte/releases?per_page=10'

/** As versões hoje são todas pré-lançamento: vale a mais recente publicada, nunca rascunho. */
export function pickLatest(releases) {
  if (!Array.isArray(releases)) return null
  const published = releases.filter((r) => r && !r.draft && r.published_at)
  published.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
  return published[0] ?? null
}

export function formatVersion(tag) {
  return String(tag).replace(/^v/, '').replace(/-([a-z]+)\.?(\d+)?$/i, (_, word, n) => ` ${word}${n ? ' ' + n : ''}`)
}

const MATCH = {
  windows: [/-setup\.exe$/i],
  linux: [/\.AppImage$/i, /\.deb$/i],
  mac: [/\.dmg$/i]
}

export function buildDownloads(release) {
  const fallback = release?.html_url ?? RELEASES_PAGE
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const entry = (patterns) => {
    const found = patterns.flatMap((p) => assets.filter((a) => p.test(a.name)))
    return {
      href: found[0]?.browser_download_url ?? fallback,
      files: found.map((a) => ({ name: a.name, mb: Math.round(a.size / 1e6) }))
    }
  }
  return {
    version: release ? formatVersion(release.tag_name) : null,
    windows: entry(MATCH.windows),
    linux: entry(MATCH.linux),
    mac: entry(MATCH.mac)
  }
}

/** Qualquer falha (sem rede, limite de uso, resposta estranha) vira lista vazia: a página fica com os links fixos. */
export async function loadReleases(fetchFn = fetch) {
  try {
    const response = await fetchFn(API)
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `cd site && npm test`
Expected: PASS, 12 testes.

- [ ] **Passo 5: Mutação**

Uma de cada vez, desfazer no código e confirmar que pelo menos um teste falha; depois restaurar:
- trocar `!r.draft &&` por `true &&` (deve falhar "ignora rascunhos");
- trocar `b.published_at) - Date.parse(a.published_at` por `a.published_at) - Date.parse(b.published_at` (deve falhar "a mais recente");
- trocar `?? fallback` por `?? RELEASES_PAGE` (deve falhar "sistema sem arquivo");
- trocar `if (!response.ok) return []` por nada (deve falhar "responde erro").

- [ ] **Passo 6: Commit**

```bash
git add site/js/releases.js site/tests/releases.test.js
git commit -m "feat(site): downloads a partir da última release do GitHub"
```

---

### Tarefa 3: Contas da história

**Files:**
- Create: `site/js/story.js`
- Test: `site/tests/story.test.js`

**Interfaces:**
- Produces:
  - `CHAPTERS = 5`
  - `chapterAt(progress: number): { index: number, local: number }`: `index` de 0 a 4, `local` de 0 a 1 dentro da cena; aceita qualquer número (negativo, maior que 1, `NaN`).
  - `windowCross(local: number, widths: { a: number, b: number }): { aX: number, aCursor: number, aCursorVisible: boolean, bX: number, bTilt: number, bCursor: number, bCursorVisible: boolean }` (posições em px na cena da janela atravessando).
  - `qualityAt(local: number): number`: Mbps de 30 a 50, em passos de 5.

- [ ] **Passo 1: Escrever os testes que falham**

`site/tests/story.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, chapterAt, qualityAt, windowCross } from '../js/story.js'

test('cinco cenas', () => assert.equal(CHAPTERS, 5))

test('chapterAt divide a rolagem em cinco partes iguais', () => {
  assert.deepEqual(chapterAt(0), { index: 0, local: 0 })
  assert.deepEqual(chapterAt(0.1), { index: 0, local: 0.5 })
  assert.equal(chapterAt(0.2).index, 1)
  assert.equal(chapterAt(0.65).index, 3)
  assert.equal(chapterAt(0.9).index, 4)
})

test('chapterAt nunca sai do intervalo (fim exato, antes do começo, depois do fim, NaN)', () => {
  assert.deepEqual(chapterAt(1), { index: 4, local: 1 })
  assert.deepEqual(chapterAt(-0.3), { index: 0, local: 0 })
  assert.deepEqual(chapterAt(1.7), { index: 4, local: 1 })
  assert.deepEqual(chapterAt(Number.NaN), { index: 0, local: 0 })
})

test('windowCross: parada no começo, atravessada no fim', () => {
  const start = windowCross(0, { a: 400, b: 300 })
  assert.equal(start.aX, 0)
  assert.equal(start.bX, -195)
  assert.equal(start.bCursorVisible, false)
  const end = windowCross(1, { a: 400, b: 300 })
  assert.equal(end.aX, 206)
  assert.equal(end.aCursorVisible, false)
  assert.equal(end.bX, 0)
  assert.equal(end.bTilt, 0)
  assert.equal(end.bCursor, 66)
  assert.equal(end.bCursorVisible, true)
})

test('windowCross anda para frente sem voltar conforme a rolagem desce', () => {
  let last = -Infinity
  for (let p = 0; p <= 1; p += 0.05) {
    const { aX } = windowCross(p, { a: 400, b: 300 })
    assert.ok(aX >= last)
    last = aX
  }
})

test('qualityAt sobe de 30 a 50 em passos de 5', () => {
  assert.equal(qualityAt(0), 30)
  assert.equal(qualityAt(0.15), 30)
  assert.equal(qualityAt(1), 50)
  assert.equal(qualityAt(2), 50)
  for (let p = 0; p <= 1; p += 0.1) assert.equal(qualityAt(p) % 5, 0)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd site && npm test`
Expected: FAIL, `Cannot find module '../js/story.js'`.

- [ ] **Passo 3: Implementar**

`site/js/story.js`:

```js
export const CHAPTERS = 5
const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** A rolagem da seção vai de 0 a 1; cada cena ocupa um quinto. */
export function chapterAt(progress) {
  const p = clamp(progress)
  const x = p * CHAPTERS
  const index = Math.min(CHAPTERS - 1, Math.floor(x))
  return { index, local: clamp(x - index) }
}

/** A janela sai do computador (a) e entra no notebook (b), presa à rolagem nos dois sentidos. */
export function windowCross(local, widths) {
  const out = clamp((local - 0.08) / 0.55)
  const into = clamp((local - 0.3) / 0.45)
  const off = widths.a * 0.5 + 6
  return {
    aX: off * out,
    aCursor: off * out,
    aCursorVisible: out < 0.98,
    // (into - 1), e não -(1 - into): no fim dá 0, e não -0, que é outro valor numa comparação estrita.
    bX: widths.b * 0.65 * (into - 1),
    bTilt: (into - 1) * 3,
    bCursor: widths.b * 0.22 * into,
    bCursorVisible: into > 0.02
  }
}

export function qualityAt(local) {
  const raw = 30 + 20 * clamp((local - 0.15) / 0.65)
  return Math.round(raw / 5) * 5
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `cd site && npm test`
Expected: PASS, 18 testes.

- [ ] **Passo 5: Mutação**

Uma de cada vez, desfazer e confirmar que um teste falha; depois restaurar:
- trocar `Math.min(CHAPTERS - 1, Math.floor(x))` por `Math.floor(x)` (deve falhar "fim exato");
- trocar `Number.isFinite(v) ?` por `true ?` (deve falhar "NaN");
- trocar `Math.round(raw / 5) * 5` por `Math.round(raw)` (deve falhar "passos de 5").

- [ ] **Passo 6: Commit**

```bash
git add site/js/story.js site/tests/story.test.js
git commit -m "feat(site): contas da história (cena atual, janela atravessando, qualidade)"
```

---

### Tarefa 4: Página estática (HTML, CSS, ícone e Motion guardada)

**Files:**
- Create: `site/index.html`
- Create: `site/styles.css`
- Create: `site/icon.png` (cópia de `app/resources/icon.png`)
- Create: `site/vendor/motion.min.js`, `site/vendor/LICENSE-motion.txt`
- Test: `site/tests/html.test.js`

**Interfaces:**
- Consumes: a prévia `docs/superpowers/specs/2026-10-05-landing-prototipo.html`.
- Produces (ids e classes que `main.js` e `scenes.js` usam, todos já existentes na prévia): `topbar`, `hero-title` (com `.l1` e `.l2`), `[data-hero]`, `showcase`, `glow`, `tilt`, `hero-app`, `hero-mbps`, `scrub`, `story`, `stage`, `app`, `app-bar`, `app-thumb`, `m-send`, `m-recv`, `app-cur`, `[data-screen]` (welcome, choose, discover, connected), `b-start`, `b-recv`, `host`, `b-extend`, `searching`, `app-pill`, `mbps`, `b-plus`, `devices`, `screen-a`, `screen-b`, `win-a`, `win-b`, `cur-a`, `cur-b`, `.cap`, `dots`, `numbers`, `[data-count]`, `[data-mask]`, `[data-rise]`, `.os[data-os]`, `.magnet`. Novos nesta tarefa: `data-dl="windows|linux|mac"` nos links Baixar, `data-dl-meta="windows|linux|mac"` nas linhas de tamanho e `data-version` no texto da versão.

- [ ] **Passo 1: Escrever o teste estático que falha**

`site/tests/html.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd site && npm test`
Expected: FAIL, `ENOENT ... index.html`.

- [ ] **Passo 3: Guardar a Motion e o ícone**

```bash
mkdir -p site/vendor
curl -sfL https://cdn.jsdelivr.net/npm/motion@12.43.0/dist/motion.min.js -o site/vendor/motion.min.js
curl -sfL https://cdn.jsdelivr.net/npm/motion@12.43.0/LICENSE.md -o site/vendor/LICENSE-motion.txt
cp app/resources/icon.png site/icon.png
wc -c site/vendor/motion.min.js   # esperado: 139877
```

Se o `LICENSE.md` não existir com esse nome, listar com `curl -s https://data.jsdelivr.com/v1/packages/npm/motion@12.43.0` e baixar o arquivo de licença que aparecer na raiz.

- [ ] **Passo 4: `site/styles.css` a partir da prévia**

Copiar todo o conteúdo entre `<style>` e `</style>` da prévia (linhas 2 a 1070) para `site/styles.css` e então:
- apagar as regras do seletor de tema, que são só da prévia: `.seg`, `.seg button`, `.seg button[aria-pressed='true']`, `.seg .seg-thumb` e `.theme-dock` (linhas 205 a 257 da prévia);
- conferir que continuam lá os blocos `/* ---------- Réplica do app` e `/* Duas telas para o capítulo` e a regra `.appwin .aseg .athumb { position: absolute; z-index: 0; }`.

- [ ] **Passo 5: `site/index.html` a partir da prévia**

Montar o arquivo assim:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Horizonte</title>
    <meta name="description" content="Use o notebook como segunda tela do seu computador, sem fio e sem configurar nada. Gratuito e de código aberto para Windows, Linux e macOS.">
    <link rel="canonical" href="https://mapompeo.github.io/horizonte/">
    <link rel="icon" href="./icon.png">
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
    <meta name="theme-color" content="#fbfbfd" media="(prefers-color-scheme: light)">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    <meta property="og:title" content="Horizonte: estenda sua tela, sem fio.">
    <meta property="og:description" content="O notebook do seu lado vira a segunda tela do computador. Sem configurar nada.">
    <meta property="og:url" content="https://mapompeo.github.io/horizonte/">
    <meta property="og:image" content="https://mapompeo.github.io/horizonte/og.png">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <!-- aqui entra a marcação da prévia, linhas 1072 a 1300 (do <header> ao </footer>) -->
    <script src="./vendor/motion.min.js"></script>
    <script type="module" src="./js/main.js"></script>
  </body>
</html>
```

E na marcação copiada da prévia:
- trocar todo `src="data:image/png;base64,...` por `src="./icon.png"`;
- nos três links "Baixar" dos cartões, trocar o `href` por `https://github.com/mapompeo/horizonte/releases` e acrescentar `data-dl="windows"`, `data-dl="linux"` e `data-dl="mac"`;
- nos três `<span class="meta">`, acrescentar `data-dl-meta="windows"`, `data-dl-meta="linux"` e `data-dl-meta="mac"`;
- no cartão do macOS, trocar `.dmg · 128 MB<br />Apple Silicon e Intel` por só `.dmg · 128 MB` (a arquitetura do build do macOS nunca foi verificada, então a página não promete);
- no `<p class="spec-line">`, envolver "0.1.0 beta 4" em `<span data-version>0.1.0 beta 4</span>`;
- não copiar o bloco `<div class="theme-dock">` nem os dois `<script>` da prévia.

- [ ] **Passo 6: Rodar e ver passar**

Run: `cd site && npm test`
Expected: PASS, 24 testes.

- [ ] **Passo 7: Conferir sem JavaScript**

Servir a pasta e abrir com o JavaScript desligado:

```bash
PORT=$(~/.claude/scripts/trabalho/pick-port.sh 4300)
npx --yes serve@14 site -l $PORT
```

Abrir `http://localhost:$PORT/` com o JavaScript desligado (DevTools, Ctrl+Shift+P, "Disable JavaScript"). Esperado: a página inteira aparece, a história mostra o app conectado com as cinco legendas em lista, e os links Baixar levam à página de releases.

- [ ] **Passo 8: Commit**

```bash
git add site/index.html site/styles.css site/icon.png site/vendor site/tests/html.test.js
git commit -m "feat(site): página estática da landing portada da prévia aprovada"
```

---

### Tarefa 5: Cola da página (sistema, downloads e versão)

**Files:**
- Create: `site/js/main.js`

**Interfaces:**
- Consumes: `detectOs`, `OS_LABEL` (Tarefa 1); `loadReleases`, `pickLatest`, `buildDownloads` (Tarefa 2); `startScenes` (Tarefa 6, importado de forma dinâmica, então esta tarefa funciona antes dela existir).
- Produces: nada para outras tarefas.

- [ ] **Passo 1: Implementar**

`site/js/main.js`:

```js
import { detectOs, OS_LABEL } from './os.js'
import { buildDownloads, loadReleases, pickLatest } from './releases.js'

const os = detectOs(navigator.userAgent)
const mine = document.querySelector(`.os[data-os="${os}"] h3`)
if (mine) mine.insertAdjacentHTML('afterend', '<span class="you">Seu sistema</span>')

/** 'Horizonte-0.1.0-setup.exe' vira 'Instalador .exe'; os outros mostram só a extensão. */
function kind(name) {
  return /-setup\.exe$/i.test(name) ? 'Instalador .exe' : name.slice(name.lastIndexOf('.'))
}

function describe(files) {
  return files.map((f) => `${kind(f.name)} · ${f.mb} MB`).join('<br />')
}

async function fillDownloads() {
  const downloads = buildDownloads(pickLatest(await loadReleases()))
  if (downloads.version === null) return // sem API: ficam os links e textos fixos do HTML
  for (const key of Object.keys(OS_LABEL)) {
    const link = document.querySelector(`[data-dl="${key}"]`)
    if (link) link.href = downloads[key].href
    const meta = document.querySelector(`[data-dl-meta="${key}"]`)
    if (meta && downloads[key].files.length > 0) meta.innerHTML = describe(downloads[key].files)
  }
  document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = downloads.version))
}

fillDownloads()

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (window.Motion && !reduce) {
  import('./scenes.js').then(({ startScenes }) => startScenes(window.Motion)).catch(() => undefined)
}
```

- [ ] **Passo 2: Conferir no navegador**

Com o servidor do Passo 7 da Tarefa 4 rodando, abrir `http://localhost:$PORT/`. Esperado:
- no cartão do seu sistema aparece "Seu sistema";
- o link Baixar do Windows aponta para `.../Horizonte-0.1.0-setup.exe` da release mais recente (passar o mouse e ver o endereço);
- a linha de versão mostra a versão da release mais recente;
- no DevTools, bloquear `api.github.com` (Network, botão direito, "Block request domain") e recarregar: os links voltam a apontar para a página de releases e nenhum erro aparece na página.

- [ ] **Passo 3: Commit**

```bash
git add site/js/main.js
git commit -m "feat(site): sistema da pessoa e downloads da última release na página"
```

---

### Tarefa 6: Animações (Motion)

**Files:**
- Create: `site/js/scenes.js`

**Interfaces:**
- Consumes: `chapterAt`, `windowCross`, `qualityAt` (Tarefa 3); a global `Motion` passada por parâmetro; os ids da Tarefa 4.
- Produces: `startScenes(M: typeof window.Motion): void`.

- [ ] **Passo 1: Portar o script da prévia**

Criar `site/js/scenes.js` com:

```js
import { chapterAt, qualityAt, windowCross } from './story.js'

export function startScenes(M) {
  document.documentElement.classList.add('motion')
  // aqui entra o corpo do script da prévia, do comentário "/* ---------- Utilitários de texto"
  // até o fim do bloco "/* ============ 7. Botões atraídos pelo cursor" (linhas 1375 a 1631)
}
```

Copiar para dentro de `startScenes` as constantes do começo do script da prévia (`spring`, `soft`, `snappy`, `$`, `clamp`, `wait`, `screens`) e o trecho das linhas 1375 a 1631. Depois fazer exatamente estas trocas:
- apagar a linha `root.classList.add('motion')` (já está no começo da função) e qualquer uso do seletor de tema;
- no `M.scroll` da história, trocar o cálculo `const x = progress * 5 ... const local = x - i` por `const { index: i, local } = chapterAt(progress)`;
- trocar o corpo de `scrubWindow(p)` por:

```js
    function scrubWindow(p) {
      const w = windowCross(p, { a: $('screen-a').clientWidth, b: $('screen-b').clientWidth })
      winA.style.transform = `translateX(${w.aX}px)`
      curA.style.transform = `translateX(${w.aCursor}px)`
      curA.style.opacity = w.aCursorVisible ? '1' : '0'
      winB.style.transform = `translateX(${w.bX}px) rotate(${w.bTilt}deg)`
      curB.style.transform = `translateX(${w.bCursor}px)`
      curB.style.opacity = w.bCursorVisible ? '1' : '0'
    }
```

- trocar a primeira linha de `scrubQuality(p)` por `const v = qualityAt(p)`.

- [ ] **Passo 2: Conferir as cenas no navegador**

Com o servidor rodando, abrir a página a 1280 de largura e rolar devagar do topo ao fim. Esperado, nesta ordem:
- título sobe palavra por palavra; o app sobe de baixo, inclinado, e se endireita ao rolar; inclina seguindo o mouse;
- a barra do topo some ao descer e volta ao subir;
- a frase de efeito acende palavra por palavra;
- a história fica presa na tela e passa pelas cinco cenas, com legenda, pontos e cursor clicando; a janela atravessa para o notebook com a rolagem e volta ao rolar para cima; os Mbps vão de 30 a 50;
- os números contam; "Sem conta. Sem nuvem. Sem configurar." sobem da máscara; os botões são atraídos pelo cursor.
Depois clicar em "Como funciona" no topo (pula para o meio da página) e conferir que a cena mostrada é a da posição, sem tela em branco.

- [ ] **Passo 3: Conferir menos movimento e celular**

- DevTools, Ctrl+Shift+P, "Emulate CSS prefers-reduced-motion: reduce", recarregar: nada se mexe, nada fica preso na tela, a história mostra o app conectado com as cinco legendas.
- DevTools em 360 px de largura: sem rolagem para o lado, textos legíveis, a história cabe na altura.
- Tema claro e escuro (DevTools, "Emulate CSS prefers-color-scheme"): os dois legíveis.

- [ ] **Passo 4: Desempenho**

DevTools, Performance, gravar rolando a história inteira. Esperado: sem tarefas longas repetidas durante a rolagem (barras vermelhas) e quadros perto de 60 por segundo. Se algum efeito travar, cortar esse efeito, não a página.

- [ ] **Passo 5: Commit**

```bash
git add site/js/scenes.js
git commit -m "feat(site): animações da landing com a Motion"
```

---

### Tarefa 7: Para as pessoas acharem (imagem, buscadores e README)

**Files:**
- Create: `site/og.png` (1200 x 630)
- Create: `site/robots.txt`, `site/sitemap.xml`
- Create: `README.md` (raiz)
- Test: `site/tests/html.test.js` (acrescentar)

- [ ] **Passo 1: Acrescentar o teste que falha**

No fim de `site/tests/html.test.js`:

```js
import { existsSync, statSync } from 'node:fs'

test('imagem de compartilhamento, robots e sitemap existem', () => {
  const og = new URL('../og.png', import.meta.url)
  assert.ok(existsSync(og))
  assert.ok(statSync(og).size > 10_000)
  const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8')
  assert.match(robots, /Sitemap: https:\/\/mapompeo\.github\.io\/horizonte\/sitemap\.xml/)
  const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8')
  assert.match(sitemap, /<loc>https:\/\/mapompeo\.github\.io\/horizonte\/<\/loc>/)
})
```

(Juntar o `import` com os do topo do arquivo.)

Run: `cd site && npm test`
Expected: FAIL no teste novo.

- [ ] **Passo 2: Criar `robots.txt` e `sitemap.xml`**

`site/robots.txt`:

```
User-agent: *
Allow: /
Sitemap: https://mapompeo.github.io/horizonte/sitemap.xml
```

`site/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mapompeo.github.io/horizonte/</loc>
  </url>
</urlset>
```

- [ ] **Passo 3: Gerar `site/og.png`**

Abrir a página servida em uma janela de 1200 x 630 com tema escuro e o topo visível (título "Estenda sua tela. Sem fio." e o começo do app) e salvar a captura como `site/og.png`. Pelo Chrome: DevTools, modo de dispositivo 1200 x 630, Ctrl+Shift+P, "Capture screenshot". Conferir que o arquivo tem 1200 x 630.

- [ ] **Passo 4: Escrever o `README.md` da raiz**

~~~markdown
# Horizonte

**Estenda sua tela. Sem fio.**

O notebook do seu lado vira a segunda tela do computador, sem configurar nada. Gratuito e de código aberto.

![Horizonte](site/og.png)

**Site:** https://mapompeo.github.io/horizonte/

## Baixar

A versão mais recente fica em [Releases](https://github.com/mapompeo/horizonte/releases).

| Sistema | Arquivo | Estado |
|---|---|---|
| Windows 10 e 11 | `Horizonte-<versão>-setup.exe` | Disponível |
| Linux | `.AppImage` ou `.deb` | Em teste |
| macOS | `.dmg` | Em teste |

O instalador ainda não é assinado. No Windows aparece "O Windows protegeu o computador": clique em Mais informações e depois em Executar assim mesmo.

## Como funciona

1. Instale nos dois computadores.
2. Em um, escolha Enviar. No outro, Mostrar.
3. Clique em Estender.

Por baixo, o Horizonte instala e configura o [Sunshine](https://github.com/LizardByte/Sunshine), o [Moonlight](https://github.com/moonlight-stream/moonlight-qt) e o [Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver). Tudo fica na sua rede local, sem conta e sem nuvem.

## Desenvolver

O app fica em `app/` (Electron, Svelte e TypeScript):

```bash
cd app
npm install
npm run dev
npm test
```

O site fica em `site/` (HTML, CSS e JavaScript, sem build):

```bash
cd site
npm test
```

## Licença

GPL-3.0-or-later.
~~~

- [ ] **Passo 5: Rodar e ver passar**

Run: `cd site && npm test`
Expected: PASS, 25 testes.

- [ ] **Passo 6: Commit**

```bash
git add site/og.png site/robots.txt site/sitemap.xml site/tests/html.test.js README.md
git commit -m "feat(site): imagem de compartilhamento, robots, sitemap e README da raiz"
```

---

### Tarefa 8: Publicação pelo GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.github/workflows/ci.yml` (bloco `on:`)

- [ ] **Passo 1: Criar `.github/workflows/pages.yml`**

```yaml
name: Site

on:
  push:
    branches: [main]
    paths: ['site/**', '.github/workflows/pages.yml']
  pull_request:
    paths: ['site/**', '.github/workflows/pages.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test

  deploy:
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Passo 2: Fazer a CI do app ignorar mudanças só no site**

Em `.github/workflows/ci.yml`, trocar o bloco `on:` por:

```yaml
on:
  pull_request:
    paths-ignore: ['site/**', '.github/workflows/pages.yml']
  push:
    branches: [main]
    tags: ['v*']
    paths-ignore: ['site/**', '.github/workflows/pages.yml']
```

(O GitHub não aplica filtro de caminho em push de tag, então as releases continuam sendo geradas.)

- [ ] **Passo 3: Commit e PR**

```bash
git add .github/workflows/pages.yml .github/workflows/ci.yml
git commit -m "ci: publica o site no GitHub Pages e a CI do app ignora o site"
git push -u origin feat/landing-page
gh pr create --base main --title "Landing page do Horizonte" --body "Landing de descoberta em site/, portada da prévia aprovada: réplica do app, história em cinco cenas presa na rolagem, números medidos e downloads lendo a última release do GitHub (com volta para a página de releases se a API falhar). Motion 12.43.0 guardada em site/vendor/. Testes com node --test. Publicação pelo GitHub Pages; a CI do app ignora mudanças só em site/."
```

Esperado no PR: o fluxo "Site" roda os testes e passa; a CI do app não roda se o PR só mexe em `site/`.

- [ ] **Passo 4: Ligar o Pages e preencher o repositório (pedir confirmação ao usuário antes)**

Estas ações mudam a configuração pública do repositório. Pedir confirmação ao usuário e só então rodar:

```bash
gh api -X POST repos/mapompeo/horizonte/pages -f build_type=workflow
gh repo edit mapompeo/horizonte --homepage https://mapompeo.github.io/horizonte/ \
  --add-topic second-screen --add-topic sunshine --add-topic moonlight --add-topic electron --add-topic svelte
```

Depois do merge na `main`, conferir o fluxo "Site" com `gh run list --workflow pages.yml --limit 1` e abrir `https://mapompeo.github.io/horizonte/`.

- [ ] **Passo 5: Lighthouse no site publicado**

```bash
npx --yes lighthouse@12 https://mapompeo.github.io/horizonte/ --quiet --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./lh-mobile.json
npx --yes lighthouse@12 https://mapompeo.github.io/horizonte/ --quiet --preset=desktop --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./lh-desktop.json
node -e "for (const f of ['lh-mobile.json','lh-desktop.json']) { const r=require('./'+f); console.log(f, Object.values(r.categories).map(c=>c.id+'='+Math.round(c.score*100)).join(' ')) }"
```

Expected: todas as notas 95 ou mais. Se alguma ficar abaixo, corrigir o que o relatório apontar (em geral contraste, tamanho de toque ou imagem sem tamanho), commitar e repetir. Os arquivos `lh-*.json` não vão para o git.

- [ ] **Passo 6: Links quebrados**

```bash
npx --yes linkinator@6 https://mapompeo.github.io/horizonte/ --skip "api.github.com"
```

Expected: nenhum link quebrado.
