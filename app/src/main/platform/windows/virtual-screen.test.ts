import { describe, expect, it } from 'vitest'
import { createWindowsVirtualScreen, parseAttached } from './virtual-screen'

function harness(installed: boolean): {
  screen: ReturnType<typeof createWindowsVirtualScreen>
  scripts: string[]
  installs(): number
} {
  const scripts: string[] = []
  let drivers = installed ? 1 : 0
  let installs = 0
  const screen = createWindowsVirtualScreen({
    run: async (script) => {
      scripts.push(script)
      if (script.includes('ChangeDisplaySettingsEx($virtual, [ref]$best'))
        return drivers ? 'tela 1920 0 1280 800\r\n' : 'sem-virtual\r\n'
      return 'ok'
    },
    installDriver: async () => {
      installs++
      drivers = 1
    },
    displayAt: (x, y) => (x === 1920 && y === 0 ? 42 : null),
    sleep: async () => undefined
  })
  return { screen, scripts, installs: () => installs }
}

describe('tela estendida no Windows (driver de monitor virtual)', () => {
  it('lê a posição e o tamanho que o roteiro de ligar imprimiu', () => {
    expect(parseAttached('tela -1280 0 1280 800')).toEqual({
      x: -1280,
      y: 0,
      width: 1280,
      height: 800
    })
    expect(parseAttached('sem-virtual')).toBeNull()
  })

  it('com o driver, liga o monitor no tamanho pedido e devolve o id do Electron', async () => {
    const h = harness(true)
    expect(await h.screen.ensure({ width: 1280, height: 800, fps: 60 })).toBe(42)
    expect(h.installs()).toBe(0)
    expect(h.scripts[0]).toContain('- 1280')
  })

  it('sem o driver, instala uma vez e liga em seguida', async () => {
    const h = harness(false)
    expect(await h.screen.ensure({ width: 1280, height: 800, fps: 60 })).toBe(42)
    expect(h.installs()).toBe(1)
  })

  it('mudar o lado liga de novo do lado novo; desligar tira o monitor da área de trabalho', async () => {
    const h = harness(true)
    await h.screen.ensure({ width: 1280, height: 800, fps: 60 })
    await h.screen.place?.({ side: 'left' })
    expect(h.scripts.at(-1)).toContain("switch ('left')")
    await h.screen.release()
    expect(h.scripts.at(-1)).toContain('0x20 -bor 0x80000 -bor 0x100000')
    expect(h.scripts.at(-1)).not.toContain('$best')
  })
})
