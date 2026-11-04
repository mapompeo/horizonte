import { contextBridge, ipcRenderer } from 'electron'
import { createFrameParser } from '../shared/frames'
import {
  MOTOR_CHANNELS,
  type MotorApi,
  type MotorFramesApi,
  type ToMotorWindow
} from '../shared/motor'

const api: MotorApi = {
  config: () => ipcRenderer.invoke(MOTOR_CHANNELS.config),
  signal: (message) => ipcRenderer.send(MOTOR_CHANNELS.signal, message),
  report: (report) => ipcRenderer.send(MOTOR_CHANNELS.report, report),
  input: (raw) => ipcRenderer.send(MOTOR_CHANNELS.input, raw),
  onMessage: (callback) => {
    const handler = (_event: unknown, message: ToMotorWindow): void => callback(message)
    ipcRenderer.on(MOTOR_CHANNELS.push, handler)
    return () => {
      ipcRenderer.removeListener(MOTOR_CHANNELS.push, handler)
    }
  }
}

/** Lê as imagens que o auxiliar do Linux manda pelo socket local (só na janela de envio, que tem o Node). */
const frames: MotorFramesApi = {
  open(path, onFrame, onClose) {
    let closed = false
    let destroy = (): void => undefined
    const close = (reason: string): void => {
      if (closed) return
      closed = true
      destroy()
      onClose(reason)
    }
    void import('node:net').then(
      ({ createConnection }) => {
        if (closed) return
        const socket = createConnection(path)
        destroy = () => socket.destroy()
        const push = createFrameParser(onFrame, close)
        socket.on('data', (chunk: Buffer) => push(chunk))
        socket.on('error', (error) => close(error.message))
        socket.on('close', () => close('fechado'))
      },
      (error: Error) => close(error.message)
    )
    return () => {
      closed = true
      destroy()
    }
  }
}

// A janela de envio roda sem isolamento de contexto: as imagens da tela estendida (8 MB cada, até 60 por segundo)
// chegam à página sem uma cópia a mais pela ponte. Ela só carrega a página local do motor. As outras janelas ficam
// isoladas e com sandbox, sem acesso ao socket.
if (process.contextIsolated) contextBridge.exposeInMainWorld('motor', api)
else Object.assign(window, { motor: api, motorFrames: frames })
