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
  turning: 'Girando a tela…',
  reconnecting: 'Reconectando…',
  left: 'Você saiu. Toque em Conectar para voltar.',
  ended: 'O computador encerrou a conexão.',
  waiting: 'Aguardando {name}…',
  allow: 'Toque em Permitir no computador.',
  opening: 'Abrindo a tela…',
  slow: 'Abrindo a tela… Se o computador pedir uma permissão, confirme lá.',
  code: 'Código',
  howToFix: 'Como resolver'
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
    turning: 'Rotating the screen…',
    reconnecting: 'Reconnecting…',
    left: 'You left. Tap Connect to come back.',
    ended: 'The computer ended the connection.',
    waiting: 'Waiting for {name}…',
    allow: 'Tap Allow on the computer.',
    opening: 'Opening the screen…',
    slow: 'Opening the screen… If the computer asks for a permission, confirm it there.',
    code: 'Code',
    howToFix: 'How to fix'
  },
  es: {
    title: 'Recibir la pantalla',
    start: 'Toca Conectar.',
    connect: 'Conectar',
    tip: 'Para pantalla completa, agrégala a la pantalla de inicio.',
    connecting: 'Conectando…',
    turning: 'Girando la pantalla…',
    reconnecting: 'Reconectando…',
    left: 'Saliste. Toca Conectar para volver.',
    ended: 'La computadora cerró la conexión.',
    waiting: 'Esperando a {name}…',
    allow: 'Toca Permitir en la computadora.',
    opening: 'Abriendo la pantalla…',
    slow: 'Abriendo la pantalla… Si la computadora pide un permiso, confírmalo allí.',
    code: 'Código',
    howToFix: 'Cómo resolverlo'
  }
}
