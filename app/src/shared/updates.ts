import type { ErrorCode } from './errors'

export type UpdateAction = 'check' | 'download' | 'install'
export interface UpdateStatus {
  phase:
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'error'
    | 'unavailable'
  currentVersion: string
  version?: string
  percent?: number
  message?: string
  /** Em que passo falhou: 501 procurar, 502 baixar, 503 instalar. */
  code?: ErrorCode
}
