/** Os textos da página de receber, no idioma do aparelho de quem abre o QR (pode ser uma visita). */
import { pickLang, type Lang } from '../../../shared/lang'

export { pickLang }
export type WebLang = Lang

const PT = {
  title: 'Receber a tela',
  start: 'Toque em Conectar.',
  connect: 'Conectar',
  tip: 'Para tela cheia, adicione à Tela de Início.',
  connecting: 'Conectando…',
  noAnswer: 'Sem resposta do computador. Tente de novo.',
  busy: 'O computador está ocupado. Tente daqui a pouco.',
  turning: 'Girando a tela…',
  reconnecting: 'Reconectando…',
  left: 'Você saiu. Toque em Conectar para voltar.',
  ended: 'O computador encerrou a conexão.',
  dropped: 'A conexão caiu.',
  waiting: 'Aguardando {name}…',
  allow: 'Toque em Permitir no computador.',
  opening: 'Abrindo a tela…',
  slow: 'Abrindo a tela… Se o computador pedir uma permissão, confirme lá.',
  deniedUser: 'O computador não permitiu.',
  deniedBusy: 'O computador está em uso. Tente depois.',
  deniedVersion: 'Versões diferentes. Atualize a página.',
  refused: 'O computador recusou.',
  unverified: 'Não deu para confirmar o computador. Tente de novo.'
}
export type WebText = typeof PT

export const WEB_TEXT: Record<WebLang, WebText> = {
  pt: PT,
  en: {
    title: 'Receive the screen',
    start: 'Tap Connect.',
    connect: 'Connect',
    tip: 'For full screen, add it to your Home Screen.',
    connecting: 'Connecting…',
    noAnswer: 'No answer from the computer. Try again.',
    busy: 'The computer is busy. Try again in a moment.',
    turning: 'Rotating the screen…',
    reconnecting: 'Reconnecting…',
    left: 'You left. Tap Connect to come back.',
    ended: 'The computer ended the connection.',
    dropped: 'The connection dropped.',
    waiting: 'Waiting for {name}…',
    allow: 'Tap Allow on the computer.',
    opening: 'Opening the screen…',
    slow: 'Opening the screen… If the computer asks for a permission, confirm it there.',
    deniedUser: 'The computer did not allow it.',
    deniedBusy: 'The computer is in use. Try later.',
    deniedVersion: 'Different versions. Reload the page.',
    refused: 'The computer refused.',
    unverified: 'Could not verify the computer. Try again.'
  },
  es: {
    title: 'Recibir la pantalla',
    start: 'Toca Conectar.',
    connect: 'Conectar',
    tip: 'Para pantalla completa, agrégala a la pantalla de inicio.',
    connecting: 'Conectando…',
    noAnswer: 'La computadora no responde. Inténtalo de nuevo.',
    busy: 'La computadora está ocupada. Inténtalo en un momento.',
    turning: 'Girando la pantalla…',
    reconnecting: 'Reconectando…',
    left: 'Saliste. Toca Conectar para volver.',
    ended: 'La computadora cerró la conexión.',
    dropped: 'Se cayó la conexión.',
    waiting: 'Esperando a {name}…',
    allow: 'Toca Permitir en la computadora.',
    opening: 'Abriendo la pantalla…',
    slow: 'Abriendo la pantalla… Si la computadora pide un permiso, confírmalo allí.',
    deniedUser: 'La computadora no lo permitió.',
    deniedBusy: 'La computadora está en uso. Inténtalo después.',
    deniedVersion: 'Versiones distintas. Recarga la página.',
    refused: 'La computadora lo rechazó.',
    unverified: 'No se pudo verificar la computadora. Inténtalo de nuevo.'
  }
}
