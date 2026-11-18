import type { AppState } from '../../shared/types'

/** Conectado (enviando ou recebendo), o Horizonte sai da frente e fica só nos ícones ocultos. */
export const belongsInTray = (state: AppState): boolean =>
  state.screen === 'connected' || state.screen === 'receiving' || state.screen === 'mouse-active'

/**
 * Decide a janela a cada mudança de estado: some ao conectar e volta ao desconectar. Abrir pelo ícone durante a
 * conexão não muda nada aqui; ao desconectar a janela é mostrada de novo de qualquer jeito.
 */
export function createTrayFollower(
  window: { hide(): void; show(): void },
  tray: {
    open(): void
    close(): void
  }
): (state: AppState) => void {
  let away = false
  return (state) => {
    const toTray = belongsInTray(state)
    if (toTray && !away) {
      away = true
      tray.open()
      window.hide()
    } else if (!toTray && away) {
      away = false
      window.show()
      tray.close()
    }
  }
}

/**
 * Um pedido que espera a resposta de quem está no computador (o Permitir de um aparelho novo, o pedido do modo Mouse):
 * a janela vem para a frente na hora em que ele chega. Minimizada ou atrás de outras, o aparelho ficava esperando.
 */
export const wantsAttention = (before: AppState['screen'] | null, now: AppState): boolean =>
  (now.screen === 'approve' || now.screen === 'mouse-request') && before !== now.screen
