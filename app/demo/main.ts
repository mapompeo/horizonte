import '../src/renderer/src/assets/main.css'
import { mount, tick } from 'svelte'
import App from '../src/renderer/src/App.svelte'
import Preview from './Preview.svelte'
import type { AppState } from '../src/shared/types'
import { installDemo } from './shim'

/** A tela de partida vem do endereço (#ready, #install...); sem nada, o app abre como abriria para quem já usa. */
const START: Record<string, AppState> = {
  install: { screen: 'install' },
  choose: { screen: 'choose' },
  ready: { screen: 'ready', mode: 'send' },
  discover: { screen: 'discover', mode: 'receive' },
  connected: { screen: 'connected', mode: 'send', device: 'Notebook' },
  receiving: { screen: 'receiving', mode: 'receive', host: '192.168.1.5', name: 'Desktop' }
}

const params = new URLSearchParams(location.search)
document.documentElement.dataset.platform = 'win32'
const theme = params.get('theme')
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme

const preview = params.get('preview')
const initial =
  preview === 'pair'
    ? ({
        screen: 'approve',
        mode: 'send',
        device: 'Notebook',
        pairingId: 'p1',
        pin: '4821'
      } as AppState)
    : preview === 'host'
      ? START.discover
      : undefined
void installDemo({
  initial: initial ?? START[location.hash.slice(1)] ?? START.ready,
  auto: params.get('auto') !== '0'
}).then(async () => {
  const target = document.getElementById('app') as HTMLElement
  if (preview) mount(Preview, { target, props: { kind: preview } })
  else mount(App, { target })
  await tick()
  window.parent.postMessage({ type: 'horizonte:demo-mounted' }, location.origin)
})
