import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type HorizonteApi } from '../shared/api'
import type { Snapshot } from '../shared/types'

const api: HorizonteApi = {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.snapshot),
  dispatch: (event) => ipcRenderer.invoke(CHANNELS.dispatch, event),
  updateSettings: (patch) => ipcRenderer.invoke(CHANNELS.updateSettings, patch),
  listHosts: () => ipcRenderer.invoke(CHANNELS.hosts),
  listMousePeers: () => ipcRenderer.invoke(CHANNELS.mousePeers),
  ownScreen: () => ipcRenderer.invoke(CHANNELS.mouseScreen),
  videoHint: () => ipcRenderer.invoke(CHANNELS.videoHint),
  deviceKind: (address?: string, name?: string) =>
    ipcRenderer.invoke(CHANNELS.deviceKind, address, name),
  getWebAccess: () => ipcRenderer.invoke(CHANNELS.webAccess),
  setWebAccess: (on) => ipcRenderer.invoke(CHANNELS.setWebAccess, on),
  openRepo: () => ipcRenderer.invoke(CHANNELS.openRepo),
  uninstall: () => ipcRenderer.invoke(CHANNELS.uninstall),
  reportDiagnostic: () => ipcRenderer.invoke(CHANNELS.reportDiagnostic),
  copyText: (text) => ipcRenderer.invoke(CHANNELS.copyText, text),
  shareLink: (url) => ipcRenderer.invoke(CHANNELS.shareLink, url),
  getUpdateStatus: () => ipcRenderer.invoke(CHANNELS.updateStatus),
  update: (action) => ipcRenderer.invoke(CHANNELS.update, action),
  onUpdate: (callback) => {
    const handler = (_event: unknown, status: import('../shared/updates').UpdateStatus): void =>
      callback(status)
    ipcRenderer.on(CHANNELS.updatePush, handler)
    return () => {
      ipcRenderer.removeListener(CHANNELS.updatePush, handler)
    }
  },
  onSnapshot: (callback) => {
    const handler = (_event: unknown, snapshot: Snapshot): void => callback(snapshot)
    ipcRenderer.on(CHANNELS.push, handler)
    return () => {
      ipcRenderer.removeListener(CHANNELS.push, handler)
    }
  }
}

contextBridge.exposeInMainWorld('horizonte', api)
