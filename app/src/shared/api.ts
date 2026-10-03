import type { AppEvent, Host, Settings, SettingsPatch, Snapshot, WebAccess } from './types'

export const CHANNELS = {
  snapshot: 'horizonte:snapshot',
  dispatch: 'horizonte:dispatch',
  updateSettings: 'horizonte:update-settings',
  hosts: 'horizonte:hosts',
  webAccess: 'horizonte:web-access',
  setWebAccess: 'horizonte:set-web-access',
  push: 'horizonte:push'
} as const

export interface HorizonteApi {
  getSnapshot(): Promise<Snapshot>
  dispatch(event: AppEvent): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  getWebAccess(): Promise<WebAccess>
  setWebAccess(on: boolean): Promise<WebAccess>
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void
}

declare global {
  interface Window {
    horizonte: HorizonteApi
  }
}
