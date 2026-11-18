import { expect, it } from 'vitest'
import { firewallAllowScript, firewallStateScript, parseFirewallState } from './firewall'

const exe = "C:\\Users\\D'Ávila\\AppData\\Local\\Programs\\Horizonte\\Horizonte.exe"

it('lê o estado: bloqueio vale mais que liberação; sem regra, ainda não perguntou', () => {
  expect(parseFirewallState('bloqueado\r\n')).toBe('blocked')
  expect(parseFirewallState('liberado\r\n')).toBe('allowed')
  expect(parseFirewallState('nada\r\n')).toBe('unknown')
  expect(parseFirewallState('publica\r\n')).toBe('public')
  expect(firewallStateScript(exe)).toContain(`-Program 'C:\\Users\\D''Ávila`)
  const script = firewallStateScript(exe)
  expect(script.indexOf("Action -eq 'Block'")).toBeLessThan(
    script.indexOf("NetworkCategory -eq 'Public'")
  )
  expect(script.indexOf("NetworkCategory -eq 'Public'")).toBeLessThan(
    script.indexOf("Action -eq 'Allow'")
  )
  // Firewall desligado na rede de casa conta como liberado: o aviso não fica para sempre na tela.
  expect(script).toMatch(/Name Private[^\n]*Enabled -eq 'False'\) \{ 'liberado' \}/)
})

it('liberar tira o bloqueio e abre só em rede privada, TCP e UDP', () => {
  const script = firewallAllowScript(exe)
  expect(script.indexOf('Remove-NetFirewallRule')).toBeLessThan(
    script.indexOf('New-NetFirewallRule')
  )
  expect(script).toContain('-Protocol TCP -Profile Private')
  expect(script).toContain('-Protocol UDP -Profile Private')
  expect(script).not.toContain('-Profile Any')
  expect(script).toContain("D''Ávila")
  expect(script).toContain('Set-NetConnectionProfile -NetworkCategory Private')
})
