import type { Host } from '../../shared/types'
import type { ClientEngine } from './port'

/**
 * Cliente de verdade ainda não existe (Plano 3: descoberta na rede e Moonlight). Até lá, em vez de
 * inventar aparelhos, a lista vem só da descoberta real (ou fica vazia) e conectar explica o motivo.
 */
export function noClientEngine(listHosts: () => Promise<Host[]> = async () => []): ClientEngine {
  return {
    listHosts,
    connect: async () => {
      throw new Error('Receber a tela neste aparelho ainda não está disponível nesta versão.')
    },
    disconnect: async () => undefined,
    applyBitrate: async () => undefined,
    onStreamEnded: () => () => undefined
  }
}
