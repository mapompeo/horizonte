import { describe, expect, it } from 'vitest'
import { ensureMotorFirewall, MOTOR_FIREWALL_SCRIPT, type FirewallDeps } from './firewall'

function deps(
  config: string | null,
  marked = false,
  fail = false
): FirewallDeps & { ran: string[]; marks: number } {
  const state = {
    ran: [] as string[],
    marks: 0,
    readConfig: async () => config,
    marked: async () => marked,
    mark: async () => {
      state.marks++
    },
    runPrivileged: async (script: string) => {
      if (fail) throw new Error('cancelado')
      state.ran.push(script)
    }
  }
  return state
}

describe('firewall do motor no Linux', () => {
  it('ufw ligado: libera a sinalização uma vez e marca', async () => {
    const d = deps('# comentário\nENABLED=yes\nLOGLEVEL=low\n')
    expect(await ensureMotorFirewall(d)).toBe('opened')
    expect(d.ran).toEqual([MOTOR_FIREWALL_SCRIPT])
    expect(d.marks).toBe(1)
    expect(MOTOR_FIREWALL_SCRIPT).toContain('port 47910:47919 proto tcp')
    expect(MOTOR_FIREWALL_SCRIPT).not.toContain('0.0.0.0/0')
  })

  it('ufw instalado mas desligado: não pede nada', async () => {
    const d = deps('ENABLED=no\n')
    expect(await ensureMotorFirewall(d)).toBe('open')
    expect(d.ran).toEqual([])
  })

  it('sem ufw: não pede nada', async () => {
    const d = deps(null)
    expect(await ensureMotorFirewall(d)).toBe('open')
    expect(d.ran).toEqual([])
  })

  it('já liberado antes: não pede a senha de novo', async () => {
    const d = deps('ENABLED=yes\n', true)
    expect(await ensureMotorFirewall(d)).toBe('open')
    expect(d.ran).toEqual([])
  })

  it('a pessoa cancela a senha: explica o que acontece', async () => {
    const d = deps('ENABLED=yes\n', false, true)
    await expect(ensureMotorFirewall(d)).rejects.toThrow(/não consegue se conectar/)
    expect(d.marks).toBe(0)
  })
})
