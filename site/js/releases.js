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

/** Como o arquivo aparece na página: diz para quem serve (os dois discos do Mac têm o mesmo tamanho de nome). */
export function fileLabel(name) {
  if (/-setup.exe$/i.test(name)) return 'Instalador .exe'
  if (/.dmg$/i.test(name)) {
    if (/arm64/i.test(name)) return 'Mac com chip Apple (.dmg)'
    if (/x64|x86_64|intel/i.test(name)) return 'Mac com chip Intel (.dmg)'
  }
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(dot)
}

/** O Mac com chip Apple é o caso mais comum: o botão Baixar leva a ele. */
const appleFirst = (a, b) => Number(/arm64/i.test(b.name)) - Number(/arm64/i.test(a.name))

const MATCH = {
  windows: [/-setup\.exe$/i],
  linux: [/\.AppImage$/i, /\.deb$/i],
  mac: [/\.dmg$/i]
}

export function buildDownloads(release) {
  const fallback = release?.html_url ?? RELEASES_PAGE
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const entry = (patterns) => {
    const found = patterns.flatMap((p) => assets.filter((a) => p.test(a.name))).sort(appleFirst)
    return {
      href: found[0]?.browser_download_url ?? fallback,
      files: found.map((a) => ({ name: a.name, mb: Math.round(a.size / 1e6), url: a.browser_download_url }))
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
