import { expect, it } from 'vitest'
import { appBundle, parseMacFirewall } from './firewall'

it('firewall do Mac: desligado conta como liberado; ligado, vale o que ele diz do app', () => {
  expect(parseMacFirewall('Firewall is disabled. (State = 0)', '')).toBe('allowed')
  const on = 'Firewall is enabled. (State = 1)'
  expect(parseMacFirewall(on, 'The application /Applications/Horizonte.app is blocked')).toBe(
    'blocked'
  )
  expect(parseMacFirewall(on, 'The application /Applications/Horizonte.app is permitted')).toBe(
    'allowed'
  )
  expect(parseMacFirewall(on, 'The application is not part of the firewall')).toBe('unknown')
})

it('o firewall lista a pasta .app, não o executável de dentro', () => {
  expect(appBundle('/Applications/Horizonte.app/Contents/MacOS/Horizonte')).toBe(
    '/Applications/Horizonte.app'
  )
})
