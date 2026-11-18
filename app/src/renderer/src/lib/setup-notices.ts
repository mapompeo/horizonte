import type { FirewallState, MacAccess } from '../../../shared/api'

/** Um aviso de primeiro uso: texto fixo (com **) e, quando dá, um botão que resolve. */
export interface SetupNotice {
  id: string
  text: string
  action?: { kind: 'allow-firewall' | 'open-screen' | 'open-accessibility'; label: string }
}

/**
 * Os avisos de liberação de cada sistema, do que impede de funcionar ao que só avisa antes de o sistema perguntar. A
 * tela mostra só o primeiro: um aviso por vez. No Linux, o ufw é liberado com a senha, e a recusa aparece no aviso de
 * baixo (VideoHint), com o comando.
 */
export function setupNotices(
  platform: string,
  firewall: FirewallState | null,
  mac: MacAccess | null
): SetupNotice[] {
  const notices: SetupNotice[] = []
  if (platform === 'darwin') {
    if (mac && (mac.screen === 'denied' || mac.screen === 'restricted'))
      notices.push({
        id: 'mac-screen-denied',
        text: 'Sem a permissão de **Gravação de Tela**, o aparelho recebe a tela preta. Ligue o Horizonte em Privacidade e Segurança e reabra o app.',
        action: { kind: 'open-screen', label: 'Abrir Ajustes' }
      })
    if (firewall === 'blocked')
      notices.push({
        id: 'mac-firewall-blocked',
        text: 'O firewall do macOS está bloqueando o Horizonte. Libere em **Ajustes do Sistema** › **Rede** › **Firewall** › **Opções**.'
      })
    if (mac?.screen === 'not-determined')
      notices.push({
        id: 'mac-screen-ask',
        text: 'Na primeira conexão, o macOS pergunta se o Horizonte pode gravar a tela: toque em **Permitir** e reabra o app quando ele pedir.'
      })
    if (firewall === 'unknown')
      notices.push({
        id: 'mac-firewall-ask',
        text: 'Se o macOS perguntar se o Horizonte pode aceitar conexões de entrada, toque em **Permitir**. Ele só conversa com aparelhos da sua casa.'
      })
    if (mac && !mac.accessibility)
      notices.push({
        id: 'mac-accessibility',
        text: 'Para o toque e o teclado do aparelho controlarem este Mac, ligue o Horizonte em **Acessibilidade**.',
        action: { kind: 'open-accessibility', label: 'Abrir Ajustes' }
      })
  } else if (platform === 'win32') {
    if (firewall === 'blocked')
      notices.push({
        id: 'win-firewall-blocked',
        text: 'O firewall do Windows está bloqueando o Horizonte, e os aparelhos não conseguem conectar.',
        action: { kind: 'allow-firewall', label: 'Liberar no firewall' }
      })
    if (firewall === 'unknown')
      notices.push({
        id: 'win-firewall-ask',
        text: 'Se o Windows perguntar sobre a rede, marque **Redes privadas** e toque em Permitir. O Horizonte só conversa com aparelhos da sua casa.'
      })
  }
  return notices
}
