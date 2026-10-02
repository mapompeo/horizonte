import type { AppEvent, Host, Settings, SettingsPatch, Snapshot } from './types'

export const CHANNELS = {
  snapshot: 'horizonte:snapshot',
  dispatch: 'horizonte:dispatch',
  updateSettings: 'horizonte:update-settings',
  hosts: 'horizonte:hosts',
  push: 'horizonte:push'
} as const

export interface HorizonteApi {
  getSnapshot(): Promise<Snapshot>
  dispatch(event: AppEvent): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void
}

declare global {
  interface Window {
    horizonte: HorizonteApi
  }
}
