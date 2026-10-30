import { describe, expect, it } from 'vitest'
import type { ScreenRequest, VirtualScreen } from '../../engine/webrtc/display'
import { createGnomeDisplay } from './gnome-display'

const HD: ScreenRequest = { width: 1920, height: 1080, fps: 60 }

function setup(options: { appears?: boolean } = {}): {
  display: VirtualScreen
  started: ScreenRequest[]
  stopped: number[]
} {
  let displays = [1]
  const started: ScreenRequest[] = []
  const stopped: number[] = []
  const display = createGnomeDisplay({
    startHelper: async (request) => {
      const n = started.push(request)
      if (options.appears !== false) displays = [...displays, 100 + n]
      return {
        displayId: 0,
        stop: () => {
          stopped.push(n)
          displays = displays.filter((id) => id !== 100 + n)
        }
      }
    },
    displays: () => displays,
    sleep: async () => undefined,
    appearTimeoutMs: 300
  })
  return { display, started, stopped }
}

describe('monitor virtual do GNOME', () => {
  it('cria a tela e devolve o id que o Electron enxerga', async () => {
    const { display, started } = setup()
    expect(await display.ensure(HD)).toBe(101)
    expect(started).toEqual([HD])
  })

  it('não recria quando o tamanho é o mesmo', async () => {
    const { display, started } = setup()
    await display.ensure(HD)
    expect(await display.ensure({ ...HD })).toBe(101)
    expect(started).toHaveLength(1)
  })

  it('troca de tela quando o tamanho muda', async () => {
    const { display, started, stopped } = setup()
    await display.ensure(HD)
    expect(await display.ensure({ width: 1366, height: 768, fps: 60 })).toBe(102)
    expect(started).toHaveLength(2)
    expect(stopped).toEqual([1])
  })

  it('devolve null se o Electron não notar a tela a tempo, mas mantém o monitor', async () => {
    const { display, stopped } = setup({ appears: false })
    expect(await display.ensure(HD)).toBeNull()
    expect(stopped).toEqual([])
  })

  it('desliga o monitor', async () => {
    const { display, stopped } = setup()
    await display.ensure(HD)
    await display.release()
    expect(stopped).toEqual([1])
    await display.release()
    expect(stopped).toEqual([1])
  })
})
