import type { SunshineDisplay } from '../engine/sunshine/log'

export interface SunshineCredentials {
  username: string
  password: string
  /** Porta base do Sunshine (47989 por padrão). */
  port: number
}

/** Garante que o Sunshine está instalado e rodando. A implementação real (com administrador) é do Plano 2B. */
export interface EngineInstaller {
  ensureInstalled(): Promise<void>
}

/** Garante que existe um monitor virtual e sabe reconhecê-lo na lista do Sunshine. */
export interface VirtualDisplay {
  ensureVirtualDisplay(): Promise<void>
  isVirtual(display: SunshineDisplay): boolean
}
