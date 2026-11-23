/** Só para destacar o botão certo; nada sai do navegador. */
export const OS_LABEL = { windows: 'Windows', linux: 'Linux', mac: 'macOS' }

export function detectOs(userAgent, maxTouchPoints = 0) {
  const ua = String(userAgent ?? '')
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/CrOS/.test(ua)) return 'chromeos'
  if (/Mac/.test(ua)) return 'mac'
  if (/Linux/.test(ua)) return 'linux'
  return 'windows'
}
