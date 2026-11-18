import { expect, it } from 'vitest'
import { showShortcut } from './shortcut'

it('atalho da janela: Ctrl+Alt+H no Windows e no Linux; no Mac, sem brigar com o ⌘⌥H do sistema', () => {
  expect(showShortcut('linux')).toEqual({ accelerator: 'Control+Alt+H', label: 'Ctrl+Alt+H' })
  expect(showShortcut('win32').accelerator).toBe('Control+Alt+H')
  expect(showShortcut('darwin')).toEqual({ accelerator: 'Command+Option+Shift+H', label: '⌘⌥⇧H' })
})
