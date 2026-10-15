import type { ExtendSide, PrepProgress } from '../../shared/types'
import type { SunshineDisplay } from '../engine/sunshine/log'

export interface SunshineCredentials {
  username: string
  password: string
  /** Porta base do Sunshine (47989 por padrão). */
  port: number
}

/** Garante que o Sunshine está instalado e rodando. A implementação real (com administrador) é do Plano 2B. */
export interface EngineInstaller {
  ensureInstalled(report?: (progress: PrepProgress) => void, signal?: AbortSignal): Promise<void>
}

/** Garante que existe um monitor virtual e sabe reconhecê-lo na lista do Sunshine. */
export interface VirtualDisplay {
  ensureVirtualDisplay(signal?: AbortSignal): Promise<void>
  isVirtual(display: SunshineDisplay): boolean
  /** Põe a tela estendida à esquerda, à direita ou acima das telas deste aparelho. */
  place?(side: ExtendSide): Promise<void>
  /** Chaves extras do Sunshine para esta tela (no Wayland: captura pelo portal). */
  config?(): Record<string, string>
  /** Saída já conhecida, sem procurar na lista do Sunshine (o portal cria o monitor só ao transmitir). */
  outputName?(): string | null
}
