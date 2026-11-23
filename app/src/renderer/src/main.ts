import './assets/main.css'
import { mount, unmount } from 'svelte'
import App from './App.svelte'
import { snapshot } from './lib/store'
import type { Language } from '../../shared/types'

// O CSS ajusta o que depende do sistema (hoje, o espaço dos botões da janela no macOS).
document.documentElement.dataset.platform = window.horizonte.platform

/** O idioma dos Ajustes; "Sistema" fica com o do navegador (o do sistema). */
function useLanguage(language: Language): void {
  const global = globalThis as { __hzLang?: string }
  if (language === 'system') delete global.__hzLang
  else global.__hzLang = language
}

// O idioma escolhido vale antes do primeiro desenho.
let language: Language =
  (await window.horizonte
    .getSnapshot()
    .then((current) => current.settings.language)
    .catch(() => null)) ?? 'system'
useLanguage(language)

const target = document.getElementById('app') as HTMLElement
let app = mount(App, { target })

// Trocou o idioma nos Ajustes: desenha tudo de novo no idioma novo, na mesma tela (os Ajustes continuam abertos).
snapshot.subscribe((current) => {
  if (!current || current.settings.language === language) return
  language = current.settings.language
  useLanguage(language)
  void unmount(app)
  app = mount(App, { target })
})

export default app
