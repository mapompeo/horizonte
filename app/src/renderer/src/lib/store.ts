import { writable } from 'svelte/store'
import type { Snapshot, WebAccess } from '../../../shared/types'

export const snapshot = writable<Snapshot | null>(null)
export const route = writable<'main' | 'settings'>('main')
export const syncError = writable<string | null>(null)

/** Busca o estado atual e passa a acompanhar as mudanças. Devolve a função que cancela. */
export async function startSync(): Promise<() => void> {
  syncError.set(null)
  let receivedPush = false
  let stop: (() => void) | undefined
  try {
    stop = window.horizonte.onSnapshot((next) => {
      receivedPush = true
      snapshot.set(next)
      if (next.state.screen === 'error' || next.state.screen === 'approve') route.set('main')
    })
    const initial = await window.horizonte.getSnapshot()
    // Um push recebido enquanto o IPC responde é mais recente que a leitura inicial.
    if (!receivedPush) snapshot.set(initial)
    return stop
  } catch (error) {
    if (receivedPush && stop) return stop
    stop?.()
    syncError.set('Não consegui carregar o Horizonte. Tente de novo.')
    throw error
  }
}

/** Depois de uma resposta perdida, confirma o acesso sem assumir que foi desligado. */
export async function changeWebAccess(current: WebAccess): Promise<WebAccess> {
  try {
    return await window.horizonte.setWebAccess(!current.on)
  } catch {
    let confirmed = current
    try {
      confirmed = await window.horizonte.getWebAccess()
    } catch {
      // Mantém o último estado confirmado e suas credenciais.
    }
    return { ...confirmed, error: 'Não consegui confirmar a mudança. Tente de novo.' }
  }
}
