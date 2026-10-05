/** Só para destacar o botão certo; nada sai do navegador. */
export const OS_LABEL = { windows: 'Windows', linux: 'Linux', mac: 'macOS' }

export function detectOs(userAgent) {
  const ua = String(userAgent ?? '')
  if (/Mac|iPhone|iPad/.test(ua)) return 'mac'
  if (/Linux|Android|CrOS/.test(ua)) return 'linux'
  return 'windows'
}
