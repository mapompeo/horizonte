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
}
