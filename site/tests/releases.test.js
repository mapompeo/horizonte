import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RELEASES_PAGE,
  buildDownloads,
  fileLabel,
  formatVersion,
  loadReleases,
  pickLatest
} from '../js/releases.js'

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
  assert.deepEqual(d.windows.files, [{ name: 'Horizonte-0.1.0-setup.exe', mb: 110, url: 'https://dl/Horizonte-0.1.0-setup.exe' }])
  assert.equal(d.linux.href, 'https://dl/Horizonte-0.1.0.AppImage')
  assert.deepEqual(d.linux.files.map((f) => f.name), ['Horizonte-0.1.0.AppImage', 'Horizonte-0.1.0.deb'])
  assert.equal(d.mac.href, 'https://dl/horizonte-0.1.0.dmg')
  assert.deepEqual(d.mac.files, [{ name: 'horizonte-0.1.0.dmg', mb: 128, url: 'https://dl/horizonte-0.1.0.dmg' }])
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
  assert.deepEqual(await loadReleases(async () => ({ ok: false, json: async () => [release('v1', '2026-01-01T00:00:00Z')] })), [])
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

test('cada arquivo tem o próprio link: quem quer o .deb não recebe o AppImage', () => {
  const d = buildDownloads(release('v0.1.0-beta.4', '2026-10-05T15:30:00Z'))
  assert.deepEqual(d.linux.files.map((f) => f.url), ['https://dl/Horizonte-0.1.0.AppImage', 'https://dl/Horizonte-0.1.0.deb'])
  assert.equal(d.windows.files[0].url, 'https://dl/Horizonte-0.1.0-setup.exe')
})

const macRelease = () => {
  const r = release('v0.1.0-beta.6', '2026-10-07T10:00:00Z')
  r.assets = [
    asset('Horizonte-0.1.0-beta.6-setup.exe', 110242450),
    asset('Horizonte-0.1.0-beta.6-x64.dmg', 130000000),
    asset('Horizonte-0.1.0-beta.6-arm64.dmg', 127620512),
    asset('Horizonte-0.1.0-beta.6.AppImage', 124994332)
  ]
  return r
}

test('fileLabel diz para quem serve cada arquivo (chip Apple, chip Intel, instalador)', () => {
  assert.equal(fileLabel('Horizonte-0.1.0-beta.6-setup.exe'), 'Instalador .exe')
  assert.equal(fileLabel('Horizonte-0.1.0-beta.6-arm64.dmg'), 'Mac com chip Apple (.dmg)')
  assert.equal(fileLabel('Horizonte-0.1.0-beta.6-x64.dmg'), 'Mac com chip Intel (.dmg)')
  assert.equal(fileLabel('horizonte-0.1.0.dmg'), '.dmg')
  assert.equal(fileLabel('Horizonte-0.1.0.AppImage'), '.AppImage')
  assert.equal(fileLabel('Horizonte-0.1.0.deb'), '.deb')
  assert.equal(fileLabel('semextensao'), 'semextensao')
})

test('macOS com dois discos: o primeiro (o botão Baixar) é o de chip Apple, e os dois aparecem', () => {
  const d = buildDownloads(macRelease())
  assert.equal(d.mac.href, 'https://dl/Horizonte-0.1.0-beta.6-arm64.dmg')
  assert.deepEqual(
    d.mac.files.map((f) => f.name),
    ['Horizonte-0.1.0-beta.6-arm64.dmg', 'Horizonte-0.1.0-beta.6-x64.dmg']
  )
  assert.equal(d.version, '0.1.0 beta 6')
})
