import type { Controller } from './controller'

/** A perda da tela de envio nao interrompe o modo receber nem substitui um erro anterior. */
export function reportDisplayLoss(controller: Controller, cause: Error): void {
  const screen = controller.getSnapshot().state.screen
  if (!['preparing', 'ready', 'approve', 'connected'].includes(screen)) return
  controller.dispatch({
    type: 'FAIL',
    error: {
      message: 'O monitor virtual foi encerrado. Tente preparar este dispositivo novamente.',
      detail: cause.message
    }
  })
}
