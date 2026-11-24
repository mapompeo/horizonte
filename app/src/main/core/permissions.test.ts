import { describe, expect, it } from 'vitest'
import { allowsPermission } from './permissions'

const MOTOR =
  'file:///C:/Users/x/AppData/Local/Programs/Horizonte/resources/app.asar/out/renderer/motor.html'

describe('permissões do Chromium', () => {
  it('a janela de transmissão do app pode capturar a tela', () => {
    expect(allowsPermission('media', MOTOR)).toBe(true)
    expect(allowsPermission('display-capture', MOTOR)).toBe(true)
    expect(
      allowsPermission('media', 'file:///opt/Horizonte/resources/app.asar/out/renderer/motor.html')
    ).toBe(true)
    expect(allowsPermission('media', 'http://localhost:5173/motor.html?role=send')).toBe(true)
  })

  it('qualquer outra página, ou qualquer outra permissão, continua negada', () => {
    expect(allowsPermission('media', 'file:///app/out/renderer/index.html')).toBe(false)
    expect(allowsPermission('media', 'http://192.168.1.7:7777/')).toBe(false)
    expect(allowsPermission('media', 'https://exemplo.com/motor.html')).toBe(false)
    expect(allowsPermission('media', 'https://exemplo.com/?x=file:///a/motor.html')).toBe(false)
    expect(allowsPermission('media', '')).toBe(false)
    for (const other of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'camera'])
      expect(allowsPermission(other, MOTOR)).toBe(false)
  })
})
