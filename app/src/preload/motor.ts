import { contextBridge, ipcRenderer } from 'electron'
import { MOTOR_CHANNELS, type MotorApi, type ToMotorWindow } from '../shared/motor'

const api: MotorApi = {
  config: () => ipcRenderer.invoke(MOTOR_CHANNELS.config),
  signal: (message) => ipcRenderer.send(MOTOR_CHANNELS.signal, message),
  report: (report) => ipcRenderer.send(MOTOR_CHANNELS.report, report),
  onMessage: (callback) => {
    const handler = (_event: unknown, message: ToMotorWindow): void => callback(message)
    ipcRenderer.on(MOTOR_CHANNELS.push, handler)
    return () => {
      ipcRenderer.removeListener(MOTOR_CHANNELS.push, handler)
    }
  }
}

contextBridge.exposeInMainWorld('motor', api)
