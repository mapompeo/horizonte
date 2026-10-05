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
    // Sem o arquivo desse sistema na versão, o link vai para a página da versão: o texto fixo mentiria.
    if (meta) meta.innerHTML = downloads[key].files.length > 0 ? describe(downloads[key].files) : 'Veja na página da versão'
  }
  document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = downloads.version))
}

fillDownloads()

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (window.Motion && !reduce) {
  import('./scenes.js').then(({ startScenes }) => startScenes(window.Motion)).catch(() => undefined)
}
