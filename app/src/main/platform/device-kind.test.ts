import { describe, expect, it } from 'vitest'
import { detectDeviceKind, type DeviceKindDeps } from './device-kind'

const deps = (over: Partial<DeviceKindDeps>): DeviceKindDeps => ({
  platform: 'win32',
  runPowerShell: async () => '',
  readText: async () => null,
  listDir: async () => [],
  run: async () => null,
  ...over
})

describe('detectDeviceKind', () => {
  it('Windows: gabinete de notebook', async () => {
    expect(await detectDeviceKind(deps({ runPowerShell: async () => '10,1\r\n' }))).toBe('laptop')
  })

  it('Windows: gabinete de mesa, sem bateria', async () => {
    expect(await detectDeviceKind(deps({ runPowerShell: async () => '3,0' }))).toBe('desktop')
  })

  it('Windows: gabinete desconhecido com bateria vira notebook', async () => {
    expect(await detectDeviceKind(deps({ runPowerShell: async () => '2,1' }))).toBe('laptop')
  })

  it('Linux: lê o gabinete do DMI; tablet é tablet', async () => {
    const linux = { platform: 'linux' as const, readText: async () => '30\n' }
    expect(await detectDeviceKind(deps(linux))).toBe('tablet')
  })

  it('Linux sem DMI, com bateria: notebook', async () => {
    const linux = {
      platform: 'linux' as const,
      listDir: async () => ['AC', 'BAT0']
    }
    expect(await detectDeviceKind(deps(linux))).toBe('laptop')
  })

  it('Mac: MacBook é notebook; o resto, mesa', async () => {
    expect(
      await detectDeviceKind(deps({ platform: 'darwin', run: async () => 'MacBookPro18,3' }))
    ).toBe('laptop')
    expect(await detectDeviceKind(deps({ platform: 'darwin', run: async () => 'Mac14,13' }))).toBe(
      'desktop'
    )
  })

  it('falhando a leitura, fica computador de mesa', async () => {
    const failing = deps({
      runPowerShell: async () => {
        throw new Error('sem PowerShell')
      }
    })
    expect(await detectDeviceKind(failing)).toBe('desktop')
  })
})
