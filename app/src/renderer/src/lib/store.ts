import { writable } from 'svelte/store'
import type { Snapshot } from '../../../shared/types'

export const snapshot = writable<Snapshot | null>(null)
export const route = writable<'main' | 'settings'>('main')

/** Busca o estado atual e passa a acompanhar as mudanças. Devolve a função que cancela. */
export async function startSync(): Promise<() => void> {
  const stop = window.horizonte.onSnapshot((next) => snapshot.set(next))
  snapshot.set(await window.horizonte.getSnapshot())
  return stop
}
