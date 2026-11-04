import { contextBridge, ipcRenderer } from 'electron'
import type { NetConnectOpts } from 'node:net'
import { createFrameParser, framePool } from '../shared/frames'
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
  open(path, onFrame, onClose, onCursor) {
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
        const push = createFrameParser(onFrame, close, framePool(), onCursor)
        // Lê direto numa área fixa de 1 MB (sem um Buffer novo por pedaço) e junta nas áreas reaproveitadas.
        const scratch = Buffer.allocUnsafe(1 << 20)
        // `onread` vale para qualquer socket, mas os tipos do Node só o declaram para TCP.
        const socket = createConnection({
          path,
          onread: {
            buffer: scratch,
            callback: (size: number, buffer: Uint8Array) => void push(buffer.subarray(0, size))
          }
        } as unknown as NetConnectOpts)
        destroy = () => socket.destroy()
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
