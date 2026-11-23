import type { FirewallState, MacAccess } from '../../../shared/api'
import { L } from './i18n'

/** Um aviso de primeiro uso: texto fixo (com **) e, quando dá, um botão que resolve. */
export interface SetupNotice {
  id: string
  text: string
  action?: {
    kind: 'allow-firewall' | 'open-screen' | 'open-accessibility' | 'open-firewall'
    label: string
  }
}

/**
 * Os avisos de liberação de cada sistema, do que impede de funcionar ao que só avisa antes de o sistema perguntar. A
 * tela mostra só o primeiro: um aviso por vez. No Linux, o ufw é liberado com a senha, e a recusa aparece no aviso de
 * baixo (VideoHint), com o comando.
 */
export function setupNotices(
  platform: string,
  firewall: FirewallState | null,
  mac: MacAccess | null,
  /** Quem recebe não grava a tela nem é controlado: no Mac, só o firewall conta. */
  role: 'send' | 'receive' = 'send'
): SetupNotice[] {
  const notices: SetupNotice[] = []
  if (platform === 'darwin' && role === 'receive') {
    if (firewall === 'blocked')
      notices.push({
        id: 'mac-firewall-blocked',
        text: L({
          pt: 'O firewall do macOS está bloqueando o Horizonte. Libere em **Ajustes do Sistema** › **Rede** › **Firewall** › **Opções**.',
          en: 'The macOS firewall is blocking Horizonte. Allow it in **System Settings** › **Network** › **Firewall** › **Options**.',
          es: 'El firewall de macOS está bloqueando Horizonte. Permítelo en **Ajustes del Sistema** › **Red** › **Firewall** › **Opciones**.'
        }),
        action: {
          kind: 'open-firewall',
          label: L({ pt: 'Abrir Ajustes', en: 'Open Settings', es: 'Abrir Ajustes' })
        }
      })
  } else if (platform === 'darwin') {
    if (mac && (mac.screen === 'denied' || mac.screen === 'restricted'))
      notices.push({
        id: 'mac-screen-denied',
        text: L({
          pt: 'Sem a permissão de **Gravação de Tela**, o aparelho recebe a tela preta. Ligue o Horizonte em Privacidade e Segurança e reabra o app.',
          en: 'Without **Screen Recording** permission, the device gets a black screen. Turn on Horizonte in Privacy & Security and reopen the app.',
          es: 'Sin el permiso de **Grabación de pantalla**, el dispositivo recibe la pantalla negra. Activa Horizonte en Privacidad y Seguridad y vuelve a abrir la app.'
        }),
        action: {
          kind: 'open-screen',
          label: L({ pt: 'Abrir Ajustes', en: 'Open Settings', es: 'Abrir Ajustes' })
        }
      })
    if (firewall === 'blocked')
      notices.push({
        id: 'mac-firewall-blocked',
        text: L({
          pt: 'O firewall do macOS está bloqueando o Horizonte. Libere em **Ajustes do Sistema** › **Rede** › **Firewall** › **Opções**.',
          en: 'The macOS firewall is blocking Horizonte. Allow it in **System Settings** › **Network** › **Firewall** › **Options**.',
          es: 'El firewall de macOS está bloqueando Horizonte. Permítelo en **Ajustes del Sistema** › **Red** › **Firewall** › **Opciones**.'
        }),
        action: {
          kind: 'open-firewall',
          label: L({ pt: 'Abrir Ajustes', en: 'Open Settings', es: 'Abrir Ajustes' })
        }
      })
    if (mac?.screen === 'not-determined')
      notices.push({
        id: 'mac-screen-ask',
        text: L({
          pt: 'O macOS vai perguntar se o Horizonte pode gravar a tela: toque em **Permitir** e reabra o app quando ele pedir. Sem isso, o aparelho recebe a tela preta.',
          en: 'macOS will ask whether Horizonte may record the screen: click **Allow** and reopen the app when it asks. Without it, the device gets a black screen.',
          es: 'macOS va a preguntar si Horizonte puede grabar la pantalla: haz clic en **Permitir** y vuelve a abrir la app cuando lo pida. Sin eso, el dispositivo recibe la pantalla negra.'
        })
      })
    if (firewall === 'unknown')
      notices.push({
        id: 'mac-firewall-ask',
        text: L({
          pt: 'Se o macOS perguntar se o Horizonte pode aceitar conexões de entrada, toque em **Permitir**. Ele só conversa com aparelhos da sua casa.',
          en: 'If macOS asks whether Horizonte may accept incoming connections, click **Allow**. It only talks to devices in your home.',
          es: 'Si macOS pregunta si Horizonte puede aceptar conexiones entrantes, haz clic en **Permitir**. Solo habla con dispositivos de tu casa.'
        })
      })
    if (mac && !mac.accessibility)
      notices.push({
        id: 'mac-accessibility',
        text: L({
          pt: 'Para o toque e o teclado do aparelho controlarem este Mac, ligue o Horizonte em **Acessibilidade**.',
          en: 'For the device’s touch and keyboard to control this Mac, turn on Horizonte in **Accessibility**.',
          es: 'Para que el toque y el teclado del dispositivo controlen esta Mac, activa Horizonte en **Accesibilidad**.'
        }),
        action: {
          kind: 'open-accessibility',
          label: L({ pt: 'Abrir Ajustes', en: 'Open Settings', es: 'Abrir Ajustes' })
        }
      })
  } else if (platform === 'win32') {
    if (firewall === 'blocked')
      notices.push({
        id: 'win-firewall-blocked',
        text: L({
          pt: 'O firewall do Windows está bloqueando o Horizonte, e os aparelhos não conseguem conectar.',
          en: 'The Windows firewall is blocking Horizonte, and devices can’t connect.',
          es: 'El firewall de Windows está bloqueando Horizonte, y los dispositivos no pueden conectarse.'
        }),
        action: {
          kind: 'allow-firewall',
          label: L({
            pt: 'Liberar no firewall',
            en: 'Allow through firewall',
            es: 'Permitir en el firewall'
          })
        }
      })
    if (firewall === 'public')
      notices.push({
        id: 'win-public-network',
        text: L({
          pt: 'O Windows marcou esta rede como **Pública** e bloqueia os aparelhos da casa. Se esta é a rede da sua casa, marque como privada.',
          en: 'Windows marked this network as **Public** and blocks the devices in your home. If this is your home network, mark it as private.',
          es: 'Windows marcó esta red como **Pública** y bloquea los dispositivos de tu casa. Si esta es la red de tu casa, márcala como privada.'
        }),
        action: {
          kind: 'allow-firewall',
          label: L({
            pt: 'Marcar como rede privada',
            en: 'Mark as private network',
            es: 'Marcar como red privada'
          })
        }
      })
    if (firewall === 'unknown')
      notices.push({
        id: 'win-firewall-ask',
        text: L({
          pt: 'Se o Windows perguntar sobre a rede, marque **Redes privadas** e toque em Permitir. O Horizonte só conversa com aparelhos da sua casa.',
          en: 'If Windows asks about the network, tick **Private networks** and click Allow. Horizonte only talks to devices in your home.',
          es: 'Si Windows pregunta por la red, marca **Redes privadas** y haz clic en Permitir. Horizonte solo habla con dispositivos de tu casa.'
        })
      })
  }
  return notices
}
