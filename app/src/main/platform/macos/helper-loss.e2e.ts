import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createController } from '../../core/controller'
import { reportDisplayLoss } from '../../core/display-loss'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { composeEngine } from '../../engine/compose'
import { FakeEngine } from '../../engine/fake'
import { SunshineEngine } from '../../engine/sunshine/engine'
import { FakeSunshineProcess } from '../../engine/sunshine/testing/fake-process'
import { startDisplayHelper, type RunningDisplay } from './helper'

const HELPER = resolve('native/macos/build/horizonte-display')
const screens = (): number =>
  Number(execFileSync(HELPER, ['--count'], { timeout: 10000 }).toString().trim())

// Apenas o monitor virtual e nativo. Sunshine simulado evita instaladores e alteracao de credenciais.
describe.runIf(process.platform === 'darwin')('perda do helper real e RETRY', () => {
  it('sair apos Pronto mostra erro e RETRY cria outra tela', async () => {
    expect(existsSync(HELPER)).toBe(true)
    const before = screens()
    const process = new FakeSunshineProcess()
    let child: ChildProcess | undefined
    let running: RunningDisplay | undefined
    let lose: (cause: Error) => void = () => undefined
    let onDisplayLost: (cause: Error) => void = () => undefined
    const server = new SunshineEngine({
      installer: { ensureInstalled: async () => undefined },
      display: {
        onLost: (listener) => {
          lose = listener
          return () => {
            lose = () => undefined
          }
        },
        ensureVirtualDisplay: async () => {
          running = await startDisplayHelper(
            () => {
              const proc = spawn(HELPER, [], { stdio: ['ignore', 'pipe', 'pipe'] })
              child = proc
              return {
                onStdout: (cb) =>
                  void proc.stdout.on('data', (chunk: Buffer) => cb(chunk.toString())),
                onStderr: (cb) =>
                  void proc.stderr.on('data', (chunk: Buffer) => cb(chunk.toString())),
                onError: (cb) => void proc.on('error', cb),
                onExit: (cb) => void proc.on('exit', cb),
                kill: () => void proc.kill('SIGTERM')
              }
            },
            20000,
            (cause) => lose(cause)
          )
          process.displays = [
            process.displays[0],
            { deviceId: String(running.displayId), friendlyName: 'Horizonte', originX: 1920 }
          ]
        },
        isVirtual: (display) => display.friendlyName === 'Horizonte'
      },
      onDisplayLost: (cause) => onDisplayLost(cause),
      memory: { load: async () => ({ encoder: 'gpu-transcoding' }), save: async () => undefined },
      credentials: async () => ({ username: 'u', password: 'p', port: 47989 }),
      createApi: () => process,
      readLog: () => process.readLog(),
      sleep: async () => process.tick()
    })
    const controller = await createController({
      engine: composeEngine(server, new FakeEngine(0)),
      store: {
        load: async () => ({ ...DEFAULT_SETTINGS, mode: 'send' }),
        save: async () => undefined
      }
    })
    onDisplayLost = (cause) => reportDisplayLoss(controller, cause)
    try {
      await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('ready'), {
        timeout: 30000,
        interval: 500
      })
      expect(screens()).toBeGreaterThan(before)
      const firstPid = child!.pid
      child!.kill('SIGKILL') // somente o PID filho desta prova; nao e stop intencional do adaptador
      await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('error'), {
        timeout: 10000
      })
      await vi.waitFor(() => expect(screens()).toBeLessThanOrEqual(before), {
        timeout: 30000,
        interval: 500
      })
      controller.dispatch({ type: 'RETRY' })
      await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('ready'), {
        timeout: 30000,
        interval: 500
      })
      expect(child!.pid).not.toBe(firstPid)
      expect(process.config.output_name).toBe(String(running!.displayId))
      expect(screens()).toBeGreaterThan(before)
    } finally {
      await server.abort()
      running?.stop()
      // Uma abertura interrompida tambem precisa encerrar o filho.
      child?.kill('SIGTERM')
      await vi.waitFor(() => expect(screens()).toBeLessThanOrEqual(before), {
        timeout: 30000,
        interval: 500
      })
    }
  })
})
