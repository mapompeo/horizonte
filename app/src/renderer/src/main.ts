import './assets/main.css'
import { mount } from 'svelte'
import App from './App.svelte'

// O CSS ajusta o que depende do sistema (hoje, o espaço dos botões da janela no macOS).
document.documentElement.dataset.platform = window.horizonte.platform

const app = mount(App, { target: document.getElementById('app') as HTMLElement })

export default app
