import { describe, expect, it } from 'vitest'
import { createProbe, runPowerShell, type PowerShellRunner } from './probes'

const returning =
  (text: string): PowerShellRunner =>
  async () =>
    text

describe('createProbe', () => {
  it('Sunshine só conta como rodando se o serviço estiver Running', async () => {
    expect(await createProbe(returning('Running\r\n')).sunshineRunning()).toBe(true)
    expect(await createProbe(returning('Stopped')).sunshineRunning()).toBe(false)
    expect(await createProbe(returning('')).sunshineRunning()).toBe(false)
  })

  it('Sunshine atendendo quando a porta do painel está escutando', async () => {
    expect(await createProbe(returning('True')).sunshineResponding()).toBe(true)
    expect(await createProbe(returning('False')).sunshineResponding()).toBe(false)
  })

  it('serviço controlável quando a permissão da pessoa comum já está no serviço', async () => {
    expect(
      await createProbe(returning('D:(A;;RPWPLCLORC;;;IU)(A;;GA;;;SY)')).serviceControllable()
    ).toBe(true)
    expect(await createProbe(returning('D:(A;;GA;;;SY)(A;;GA;;;BA)')).serviceControllable()).toBe(
      false
    )
  })

  it('driver presente quando o PowerShell encontra o dispositivo', async () => {
    expect(await createProbe(returning('True')).driverPresent()).toBe(true)
    expect(await createProbe(returning('False')).driverPresent()).toBe(false)
  })

  it('erro ao consultar vale como "não está": instalar de novo é seguro, afirmar que existe não é', async () => {
    const broken: PowerShellRunner = async () => {
      throw new Error('powershell sumiu')
    }
    expect(await createProbe(broken).sunshineRunning()).toBe(false)
    expect(await createProbe(broken).driverPresent()).toBe(false)
  })
})

describe.runIf(process.platform === 'win32')('no PowerShell de verdade, sem administrador', () => {
  it('as consultas rodam sem erro de sintaxe e respondem sim ou não', async () => {
    const probe = createProbe(runPowerShell)
    expect(typeof (await probe.sunshineRunning())).toBe('boolean')
    expect(typeof (await probe.driverPresent())).toBe('boolean')
    expect(typeof (await probe.sunshineResponding())).toBe('boolean')
    expect(typeof (await probe.serviceControllable())).toBe('boolean')
  }, 30_000)
})
