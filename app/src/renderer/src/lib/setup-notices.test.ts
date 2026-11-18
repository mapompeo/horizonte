import { expect, it } from 'vitest'
import { setupNotices } from './setup-notices'

const ids = (...args: Parameters<typeof setupNotices>): string[] =>
  setupNotices(...args).map((notice) => notice.id)

it('Windows: bloqueado vem com o botão de liberar; antes de perguntar, o aviso de Redes privadas', () => {
  expect(setupNotices('win32', 'blocked', null)[0].action?.kind).toBe('allow-firewall')
  expect(ids('win32', 'unknown', null)).toEqual(['win-firewall-ask'])
  expect(ids('win32', 'allowed', null)).toEqual([])
})

it('Mac: o que impede de funcionar vem antes do que só avisa', () => {
  expect(ids('darwin', 'unknown', { screen: 'denied', accessibility: false })).toEqual([
    'mac-screen-denied',
    'mac-firewall-ask',
    'mac-accessibility'
  ])
  expect(ids('darwin', 'blocked', { screen: 'not-determined', accessibility: true })).toEqual([
    'mac-firewall-blocked',
    'mac-screen-ask'
  ])
  expect(ids('darwin', 'allowed', { screen: 'granted', accessibility: true })).toEqual([])
})

it('um sistema nunca mostra o aviso do outro; Linux fica com o aviso de baixo', () => {
  expect(ids('linux', 'blocked', { screen: 'denied', accessibility: false })).toEqual([])
  expect(setupNotices('win32', 'unknown', null)[0].text).not.toContain('macOS')
  expect(setupNotices('darwin', 'unknown', null)[0].text).not.toContain('Windows')
})

it('todo negrito abre e fecha (a tela troca ** por <b>)', () => {
  const all = [
    ...setupNotices('win32', 'blocked', null),
    ...setupNotices('win32', 'unknown', null),
    ...setupNotices('darwin', 'blocked', { screen: 'denied', accessibility: false }),
    ...setupNotices('darwin', 'unknown', { screen: 'not-determined', accessibility: false })
  ]
  expect(all.length).toBe(8)
  for (const notice of all) expect(notice.text.split('**').length % 2).toBe(1)
})
