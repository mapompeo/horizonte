/** Tamanho que quem mostra pediu para a tela estendida. */
export interface ScreenRequest {
  width: number
  height: number
  fps: number
}

/** A tela extra que o motor transmite. Cada sistema tem a sua implementação em `platform/`. */
export interface VirtualScreen {
  /**
   * Cria (ou confirma) o monitor virtual neste tamanho e devolve o id dele na lista do Electron
   * (`screen.getAllDisplays()`); null quando ele existe mas o Electron ainda não o enxerga.
   */
  ensure(request: ScreenRequest): Promise<number | null>
  /** Desliga o monitor virtual: as janelas que estavam nele voltam para as outras telas. */
  release(): Promise<void>
}
