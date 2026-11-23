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
    date: '2026-11-23',
    items: [
      {
        pt: 'Receber a tela de outro computador e Compartilhar o mouse ficam à vista na tela de Enviar.',
        en: 'Receive another computer’s screen and Share the mouse are now on the Send screen.',
        es: 'Recibir la pantalla de otra computadora y Compartir el mouse están en la pantalla de Enviar.'
      },
      {
        pt: 'Receber a tela de outro computador foi para os Ajustes; Enviar ficou mais simples.',
        en: 'Receiving another computer’s screen moved to Settings; Send is now simpler.',
        es: 'Recibir la pantalla de otra computadora pasó a Ajustes; Enviar quedó más simple.'
      },
      {
        pt: 'No Mac e no Windows, arrastar a tela no mapa muda de verdade o lugar dela.',
        en: 'On Mac and Windows, dragging the screen on the map really moves it.',
        es: 'En Mac y Windows, arrastrar la pantalla en el mapa la mueve de verdad.'
      },
      {
        pt: 'Enviar diagnóstico manda o registro do app, sem dados pessoais, para a gente achar o problema.',
        en: 'Send diagnostics now includes the app log, without personal data, so we can find the problem.',
        es: 'Enviar diagnóstico manda el registro de la app, sin datos personales, para encontrar el problema.'
      }
    ]
  },
  {
    date: '2026-11-22',
    items: [
      {
        pt: 'Se a imagem não chega ao aparelho, ele e o computador mostram o que fazer, com o código.',
        en: 'If the picture does not reach the device, it and the computer show what to do, with the code.',
        es: 'Si la imagen no llega al dispositivo, él y la computadora muestran qué hacer, con el código.'
      },
      {
        pt: 'No iPad antigo, a tela não fica mais com o "?" no lugar da imagem.',
        en: 'On older iPads, the screen no longer shows a "?" instead of the picture.',
        es: 'En el iPad antiguo, la pantalla ya no muestra un "?" en lugar de la imagen.'
      },
      {
        pt: 'No Windows, a tela estendida instala mesmo com o PowerShell 7 no computador.',
        en: 'On Windows, the extended screen installs even with PowerShell 7 on the computer.',
        es: 'En Windows, la pantalla extendida se instala aunque la computadora tenga PowerShell 7.'
      }
    ]
  },
  {
    date: '2026-11-19',
    items: [
      {
        pt: 'iPad e iPhone antigos (até o iOS 9) agora recebem a tela pelo navegador.',
        en: 'Older iPads and iPhones (down to iOS 9) can now receive the screen in the browser.',
        es: 'Los iPad y iPhone antiguos (hasta iOS 9) ahora reciben la pantalla en el navegador.'
      },
      {
        pt: 'Sem câmera, a tela inicial lembra que dá para digitar o endereço no navegador.',
        en: 'Without a camera, the home screen reminds you to type the address in a browser.',
        es: 'Sin cámara, la pantalla inicial recuerda que puedes escribir la dirección en el navegador.'
      },
      {
        pt: 'Arrastar a tela nos Ajustes muda de verdade a posição do aparelho conectado.',
        en: 'Dragging the screen in Settings really moves the connected device.',
        es: 'Arrastrar la pantalla en Ajustes mueve de verdad el dispositivo conectado.'
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
