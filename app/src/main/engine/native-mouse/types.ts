import type { MouseSide, ScreenSize } from '../../../shared/types'

/** Trecho de cada borda que se encosta, em % (0 a 100) do comprimento da borda de cada computador. */
export interface EdgeRanges {
  own: [number, number]
  peer: [number, number]
}

/** Um computador encostado neste: de que lado e em que trecho das bordas. */
export interface MouseLink {
  name: string
  side: MouseSide
  ranges?: EdgeRanges
  /** Onde ele está na rede e o tamanho da área de trabalho dele. */
  address?: string
  screen?: ScreenSize
}

export interface MouseShare {
  /** Este computador empresta o mouse e o teclado aos computadores encostados nele (`links`). */
  share(options: { name: string; links: MouseLink[]; token: string }): Promise<void>
  /** Este computador passa a ser controlado pelo mouse do outro. */
  follow(options: { name: string; serverAddress: string; token: string }): Promise<void>
  stop(): void
  /** O auxiliar terminou sozinho (erro, ou o outro lado fechou). */
  onEnded(listener: () => void): () => void
}
