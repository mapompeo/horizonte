import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type HorizonteApi } from '../shared/api'
import type { Snapshot } from '../shared/types'

const api: HorizonteApi = {
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.snapshot),
  dispatch: (event) => ipcRenderer.invoke(CHANNELS.dispatch, event),
  updateSettings: (patch) => ipcRenderer.invoke(CHANNELS.updateSettings, patch),
  listHosts: () => ipcRenderer.invoke(CHANNELS.hosts),
  getWebAccess: () => ipcRenderer.invoke(CHANNELS.webAccess),
  setWebAccess: (on) => ipcRenderer.invoke(CHANNELS.setWebAccess, on),
  openRepo: () => ipcRenderer.invoke(CHANNELS.openRepo),
  copyDiagnostic: () => ipcRenderer.invoke(CHANNELS.copyDiagnostic),
  onSnapshot: (callback) => {
    const handler = (_event: unknown, snapshot: Snapshot): void => callback(snapshot)
    ipcRenderer.on(CHANNELS.push, handler)
    return () => {
      ipcRenderer.removeListener(CHANNELS.push, handler)
    }
  }
}

contextBridge.exposeInMainWorld('horizonte', api)
