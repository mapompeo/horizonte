/**
 * Atalho de qualquer lugar que traz a janela do Horizonte (no GNOME não há ícone na bandeja). No Mac, ⌘⌥H já é
 * "Ocultar os outros" e ⌃⌥ é do VoiceOver: lá vai com o Shift junto.
 */
export const showShortcut = (platform: string): { accelerator: string; label: string } =>
  platform === 'darwin'
    ? { accelerator: 'Command+Option+Shift+H', label: '⌘⌥⇧H' }
    : { accelerator: 'Control+Alt+H', label: 'Ctrl+Alt+H' }
