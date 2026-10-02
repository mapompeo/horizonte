import type { Controller } from './core/controller'
import type { FakeEngine } from './engine/fake'

/** Roteiro automático para ver o fluxo de envio sem um segundo computador. Só roda fora do app empacotado. */
export function runDevDemo(controller: Controller, engine: FakeEngine): void {
  let pairRequested = false
  let connectedOnce = false

  controller.subscribe(({ state }) => {
    if (state.screen !== 'ready') return

    if (!pairRequested) {
      pairRequested = true
      setTimeout(() => engine.simulatePairRequest('Notebook'), 3000)
      return
    }

    if (!connectedOnce) {
      setTimeout(() => {
        if (connectedOnce || !engine.calls.includes('approve')) return
        connectedOnce = true
        engine.simulateClientConnected('Notebook')
      }, 1500)
    }
  })
}
