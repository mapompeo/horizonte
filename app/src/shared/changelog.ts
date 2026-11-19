import type { Lang } from './lang'

/**
 * O que mudou, para quem usa: aparece nos Ajustes ("O que mudou"), embaixo da versão. A entrada mais nova fica em
 * cima. Cada item é uma frase curta, sem termo técnico, nos três idiomas: o que a pessoa ganha, não o que mudou no
 * código. Toda mudança que a pessoa nota entra aqui no mesmo commit.
 */
export interface Change {
  /** Dia da mudança (AAAA-MM-DD). */
  date: string
  items: Record<Lang, string>[]
}

export const CHANGELOG: Change[] = [
  {
    date: '2026-11-19',
    items: [
      {
        pt: 'iPad e iPhone antigos (até o iOS 9) agora recebem a tela pelo navegador.',
        en: 'Older iPads and iPhones (down to iOS 9) can now receive the screen in the browser.',
        es: 'Los iPad y iPhone antiguos (hasta iOS 9) ahora reciben la pantalla en el navegador.'
      },
      {
        pt: 'Escolha o idioma do app nos Ajustes.',
        en: 'Choose the app language in Settings.',
        es: 'Elige el idioma de la app en Ajustes.'
      },
      {
        pt: 'Cada erro mostra o que fazer e um código, com a explicação no site.',
        en: 'Every error shows what to do and a code, explained on the website.',
        es: 'Cada error muestra qué hacer y un código, explicado en el sitio.'
      },
      {
        pt: 'Trocar entre Enviar e Receber com aparelhos conectados pede confirmação.',
        en: 'Switching between Send and Receive with devices connected asks for confirmation.',
        es: 'Cambiar entre Enviar y Recibir con dispositivos conectados pide confirmación.'
      },
      {
        pt: 'Fechar a janela fecha o Horizonte de verdade, sem deixar nada rodando.',
        en: 'Closing the window really closes Horizonte, leaving nothing running.',
        es: 'Cerrar la ventana cierra Horizonte de verdad, sin dejar nada abierto.'
      }
    ]
  },
  {
    date: '2026-11-18',
    items: [
      {
        pt: 'O app agora fala português, inglês e espanhol.',
        en: 'The app now speaks Portuguese, English and Spanish.',
        es: 'La app ahora habla portugués, inglés y español.'
      },
      {
        pt: 'Avisos de primeira vez com um botão para liberar o firewall e as permissões.',
        en: 'First-time notices with a button to allow the firewall and permissions.',
        es: 'Avisos de primera vez con un botón para permitir el firewall y los permisos.'
      },
      {
        pt: 'No Windows, a tela estendida fica no tamanho exato do aparelho.',
        en: 'On Windows, the extended screen matches the device size exactly.',
        es: 'En Windows, la pantalla extendida tiene el tamaño exacto del dispositivo.'
      },
      {
        pt: 'Receber conecta sozinho ao último computador quando ele aparece na rede.',
        en: 'Receive connects to the last computer by itself when it shows up on the network.',
        es: 'Recibir se conecta solo a la última computadora cuando aparece en la red.'
      },
      {
        pt: 'A bolinha de cada aparelho mostra como está a conexão.',
        en: 'Each device’s dot shows how the connection is doing.',
        es: 'El punto de cada dispositivo muestra cómo está la conexión.'
      }
    ]
  }
]
