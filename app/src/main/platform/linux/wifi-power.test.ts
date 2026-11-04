import { describe, expect, it } from 'vitest'
import { parsePowerSave, wifiPowerHint, WIFI_POWER_COMMAND } from './wifi-power'

describe('aviso da economia de energia do Wi-Fi', () => {
  it('avisa quando alguma interface conectada está economizando', () => {
    const hint = wifiPowerHint({ interfaces: [{ name: 'wlp0s20f3', powerSave: true }] })
    expect(hint?.command).toBe(WIFI_POWER_COMMAND)
    expect(hint?.message).toContain('economia de energia do Wi-Fi')
  })

  it('não avisa com ela desligada, sem Wi-Fi ou sem saber', () => {
    expect(wifiPowerHint({ interfaces: [{ name: 'wlan0', powerSave: false }] })).toBeNull()
    expect(wifiPowerHint({ interfaces: [] })).toBeNull()
    expect(wifiPowerHint({ interfaces: [{ name: 'wlan0', powerSave: null }] })).toBeNull()
  })

  it('lê a saída do iw', () => {
    expect(parsePowerSave('Power save: on\n')).toBe(true)
    expect(parsePowerSave('Power save: off')).toBe(false)
    expect(parsePowerSave('command failed: No such device (-19)')).toBeNull()
  })

  it('o comando grava o ajuste do NetworkManager e reconecta', () => {
    expect(WIFI_POWER_COMMAND).toContain('/etc/NetworkManager/conf.d/')
    expect(WIFI_POWER_COMMAND).toContain('wifi.powersave = 2')
  })
})
