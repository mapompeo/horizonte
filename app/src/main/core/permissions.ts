/**
 * O app nega todo pedido de permissão do Chromium (câmera, microfone, localização...), menos a captura da tela, que o
 * Chromium pede como `media` (ou `display-capture`), e só quando quem pede é a janela de transmissão do próprio app,
 * que carrega a página local `motor.html`. A janela principal e qualquer outra página continuam sem nenhuma permissão.
 * O app só chama `getDisplayMedia` (a tela): nunca câmera nem microfone.
 */
const SCREEN = new Set(['media', 'display-capture'])
const MOTOR_PAGE = /^(file:\/\/\/.*\/|http:\/\/localhost:\d+\/)motor\.html(\?.*)?$/

export function allowsPermission(permission: string, pageUrl: string): boolean {
  return SCREEN.has(permission) && MOTOR_PAGE.test(pageUrl)
}
