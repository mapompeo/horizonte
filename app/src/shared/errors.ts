import { L, type Lang } from './lang'

/**
 * Os erros que a pessoa vê, cada um com um código (HZ-xxx), um título que diz o que aconteceu e uma frase que diz o
 * que fazer. O código aparece junto e leva à tabela do site (`site/erros.html`), que repete este catálogo.
 *
 * Como escrever: o título é o que aconteceu, em palavras simples, sem culpar a pessoa e sem termo técnico. A frase é
 * o próximo passo, no imperativo, com ponto final. Os três idiomas sempre juntos.
 */
interface Entry {
  title: Record<Lang, string>
  fix: Record<Lang, string>
}

const RESTART = {
  pt: 'Feche e abra o Horizonte de novo. Se continuar, envie o diagnóstico nos Ajustes.',
  en: 'Close and open Horizonte again. If it continues, send the diagnostic in Settings.',
  es: 'Cierra y abre Horizonte de nuevo. Si continúa, envía el diagnóstico en Ajustes.'
}
const SAME_NETWORK = {
  pt: 'Confira se o Horizonte está aberto no outro aparelho e se os dois estão na mesma rede Wi-Fi.',
  en: 'Check that Horizonte is open on the other device and that both are on the same Wi-Fi network.',
  es: 'Revisa que Horizonte esté abierto en el otro dispositivo y que los dos estén en la misma red Wi-Fi.'
}
const ASK_AGAIN = {
  pt: 'Peça de novo pelo outro aparelho.',
  en: 'Ask again from the other device.',
  es: 'Pide de nuevo desde el otro dispositivo.'
}
const SENDING_OPEN = {
  pt: 'Confira se o Horizonte está aberto em Enviar no computador, na mesma rede Wi-Fi.',
  en: 'Check that Horizonte is open on Send on the computer, on the same Wi-Fi network.',
  es: 'Revisa que Horizonte esté abierto en Enviar en la computadora, en la misma red Wi-Fi.'
}

export const ERRORS = {
  'HZ-100': {
    title: { pt: 'Algo deu errado', en: 'Something went wrong', es: 'Algo salió mal' },
    fix: RESTART
  },
  // 1xx: preparar este computador
  'HZ-101': {
    title: {
      pt: 'Não deu para preparar a tela',
      en: 'Could not get the screen ready',
      es: 'No se pudo preparar la pantalla'
    },
    fix: RESTART
  },
  'HZ-102': {
    title: {
      pt: 'Outro programa está usando a conexão do Horizonte',
      en: 'Another program is using Horizonte’s connection',
      es: 'Otro programa está usando la conexión de Horizonte'
    },
    fix: {
      pt: 'Feche outros programas de tela remota ou outra cópia do Horizonte e tente de novo.',
      en: 'Close other remote screen programs or another copy of Horizonte and try again.',
      es: 'Cierra otros programas de pantalla remota u otra copia de Horizonte e inténtalo de nuevo.'
    }
  },
  'HZ-103': {
    title: {
      pt: 'O Horizonte não conseguiu salvar os arquivos dele',
      en: 'Horizonte could not save its files',
      es: 'Horizonte no pudo guardar sus archivos'
    },
    fix: {
      pt: 'Reinicie o computador e tente de novo.',
      en: 'Restart the computer and try again.',
      es: 'Reinicia la computadora e inténtalo de nuevo.'
    }
  },
  'HZ-104': {
    title: { pt: 'O disco está cheio', en: 'The disk is full', es: 'El disco está lleno' },
    fix: {
      pt: 'Libere espaço no disco e tente de novo.',
      en: 'Free up disk space and try again.',
      es: 'Libera espacio en el disco e inténtalo de nuevo.'
    }
  },
  'HZ-105': {
    title: {
      pt: 'Não deu para abrir a página do celular',
      en: 'Could not open the phone page',
      es: 'No se pudo abrir la página del celular'
    },
    fix: {
      pt: 'Feche programas que usem a porta 7777 e tente de novo.',
      en: 'Close programs that use port 7777 and try again.',
      es: 'Cierra los programas que usen el puerto 7777 e inténtalo de nuevo.'
    }
  },
  'HZ-106': {
    title: {
      pt: 'Não deu para abrir o Horizonte junto com o sistema',
      en: 'Could not set Horizonte to open with the system',
      es: 'No se pudo abrir Horizonte junto con el sistema'
    },
    fix: {
      pt: 'Desligue e ligue de novo “Abrir com o sistema” nos Ajustes. Se continuar, reinicie o computador.',
      en: 'Turn “Open with the system” off and on again in Settings. If it continues, restart the computer.',
      es: 'Apaga y vuelve a activar “Abrir con el sistema” en Ajustes. Si continúa, reinicia la computadora.'
    }
  },
  'HZ-107': {
    title: {
      pt: 'Não deu para iniciar o Horizonte',
      en: 'Could not start Horizonte',
      es: 'No se pudo iniciar Horizonte'
    },
    fix: {
      pt: 'Reinicie o computador e abra o Horizonte de novo. Se continuar, instale a versão mais nova pelo site.',
      en: 'Restart the computer and open Horizonte again. If it continues, install the latest version from the website.',
      es: 'Reinicia la computadora y abre Horizonte de nuevo. Si continúa, instala la versión más reciente desde el sitio.'
    }
  },
  // 2xx: a tela estendida
  'HZ-201': {
    title: {
      pt: 'A tela estendida não apareceu',
      en: 'The extended screen did not appear',
      es: 'La pantalla extendida no apareció'
    },
    fix: {
      pt: 'Reinicie o computador e tente de novo.',
      en: 'Restart the computer and try again.',
      es: 'Reinicia la computadora e inténtalo de nuevo.'
    }
  },
  'HZ-202': {
    title: {
      pt: 'Não deu para instalar o monitor virtual',
      en: 'Could not install the virtual monitor',
      es: 'No se pudo instalar el monitor virtual'
    },
    fix: {
      pt: 'Tente de novo e aceite a permissão de administrador quando ela aparecer.',
      en: 'Try again and accept the administrator permission when it appears.',
      es: 'Inténtalo de nuevo y acepta el permiso de administrador cuando aparezca.'
    }
  },
  'HZ-203': {
    title: {
      pt: 'Este computador não cria uma tela estendida',
      en: 'This computer cannot create an extended screen',
      es: 'Esta computadora no crea una pantalla extendida'
    },
    fix: {
      pt: 'Atualize o sistema. No Linux, use o GNOME.',
      en: 'Update the system. On Linux, use GNOME.',
      es: 'Actualiza el sistema. En Linux, usa GNOME.'
    }
  },
  'HZ-204': {
    title: {
      pt: 'O Horizonte não consegue ver a tela',
      en: 'Horizonte cannot see the screen',
      es: 'Horizonte no puede ver la pantalla'
    },
    fix: {
      pt: 'Libere a Gravação de Tela para o Horizonte nos ajustes do sistema e tente de novo.',
      en: 'Allow Screen Recording for Horizonte in the system settings and try again.',
      es: 'Permite la Grabación de pantalla para Horizonte en los ajustes del sistema e inténtalo de nuevo.'
    }
  },
  // 3xx: a conexão entre os aparelhos
  'HZ-301': {
    title: { pt: 'Não deu para conectar', en: 'Could not connect', es: 'No se pudo conectar' },
    fix: SAME_NETWORK
  },
  'HZ-302': {
    title: {
      pt: 'O outro aparelho não respondeu',
      en: 'The other device did not answer',
      es: 'El otro dispositivo no respondió'
    },
    fix: SAME_NETWORK
  },
  'HZ-303': {
    title: {
      pt: 'O outro aparelho fechou a conexão',
      en: 'The other device closed the connection',
      es: 'El otro dispositivo cerró la conexión'
    },
    fix: {
      pt: 'Conecte de novo.',
      en: 'Connect again.',
      es: 'Conéctate de nuevo.'
    }
  },
  'HZ-304': {
    title: {
      pt: 'Não deu para responder ao pedido',
      en: 'Could not answer the request',
      es: 'No se pudo responder la solicitud'
    },
    fix: ASK_AGAIN
  },
  'HZ-305': {
    title: {
      pt: 'O pedido não vale mais',
      en: 'The request is no longer valid',
      es: 'La solicitud ya no es válida'
    },
    fix: ASK_AGAIN
  },
  'HZ-306': {
    title: {
      pt: 'Não deu para desconectar',
      en: 'Could not disconnect',
      es: 'No se pudo desconectar'
    },
    fix: RESTART
  },
  // 4xx: o mouse compartilhado
  'HZ-401': {
    title: {
      pt: 'O mouse compartilhado não funciona neste sistema',
      en: 'The shared mouse does not work on this system',
      es: 'El mouse compartido no funciona en este sistema'
    },
    fix: {
      pt: 'Use Enviar ou Receber para estender a tela.',
      en: 'Use Send or Receive to extend the screen.',
      es: 'Usa Enviar o Recibir para extender la pantalla.'
    }
  },
  'HZ-402': {
    title: {
      pt: 'Não deu para ligar o mouse compartilhado',
      en: 'Could not turn on the shared mouse',
      es: 'No se pudo activar el mouse compartido'
    },
    fix: {
      pt: 'Libere a Acessibilidade para o Horizonte, se o sistema pedir, e tente de novo.',
      en: 'Allow Accessibility for Horizonte if the system asks, and try again.',
      es: 'Permite la Accesibilidad para Horizonte si el sistema lo pide, e inténtalo de nuevo.'
    }
  },
  'HZ-403': {
    title: {
      pt: 'Não deu para compartilhar o mouse',
      en: 'Could not share the mouse',
      es: 'No se pudo compartir el mouse'
    },
    fix: SAME_NETWORK
  },
  // 5xx: atualizações
  'HZ-501': {
    title: {
      pt: 'Não deu para procurar atualização',
      en: 'Could not check for updates',
      es: 'No se pudo buscar actualizaciones'
    },
    fix: {
      pt: 'Confira a internet e tente de novo.',
      en: 'Check the internet connection and try again.',
      es: 'Revisa la conexión a internet e inténtalo de nuevo.'
    }
  },
  'HZ-502': {
    title: {
      pt: 'Não deu para baixar a atualização',
      en: 'Could not download the update',
      es: 'No se pudo descargar la actualización'
    },
    fix: {
      pt: 'Confira a internet e tente de novo. Se continuar, baixe a versão nova pelo site.',
      en: 'Check the internet connection and try again. If it continues, download the new version from the website.',
      es: 'Revisa la conexión a internet e inténtalo de nuevo. Si continúa, descarga la versión nueva desde el sitio.'
    }
  },
  'HZ-503': {
    title: {
      pt: 'Não deu para instalar a atualização',
      en: 'Could not install the update',
      es: 'No se pudo instalar la actualización'
    },
    fix: {
      pt: 'Tente de novo e confirme a senha do sistema se ela aparecer. Se continuar, instale a versão nova pelo site.',
      en: 'Try again and confirm the system password if it appears. If it continues, install the new version from the website.',
      es: 'Inténtalo de nuevo y confirma la contraseña del sistema si aparece. Si continúa, instala la versión nueva desde el sitio.'
    }
  },
  // 6xx: receber pelo navegador (celular, tablet)
  'HZ-601': {
    title: {
      pt: 'O computador não respondeu',
      en: 'The computer did not answer',
      es: 'La computadora no respondió'
    },
    fix: SENDING_OPEN
  },
  'HZ-602': {
    title: {
      pt: 'O computador está ocupado',
      en: 'The computer is busy',
      es: 'La computadora está ocupada'
    },
    fix: {
      pt: 'Espere um pouco e toque em Conectar.',
      en: 'Wait a moment and tap Connect.',
      es: 'Espera un poco y toca Conectar.'
    }
  },
  'HZ-603': {
    title: {
      pt: 'O computador não permitiu',
      en: 'The computer did not allow it',
      es: 'La computadora no lo permitió'
    },
    fix: {
      pt: 'Toque em Conectar e escolha Permitir no computador.',
      en: 'Tap Connect and choose Allow on the computer.',
      es: 'Toca Conectar y elige Permitir en la computadora.'
    }
  },
  'HZ-604': {
    title: {
      pt: 'Versões diferentes do Horizonte',
      en: 'Different versions of Horizonte',
      es: 'Versiones distintas de Horizonte'
    },
    fix: {
      pt: 'Atualize o Horizonte no computador e recarregue esta página.',
      en: 'Update Horizonte on the computer and reload this page.',
      es: 'Actualiza Horizonte en la computadora y recarga esta página.'
    }
  },
  'HZ-605': {
    title: { pt: 'A conexão caiu', en: 'The connection dropped', es: 'Se cayó la conexión' },
    fix: {
      pt: 'Toque em Conectar.',
      en: 'Tap Connect.',
      es: 'Toca Conectar.'
    }
  },
  'HZ-606': {
    title: {
      pt: 'Não deu para confirmar que é o seu computador',
      en: 'Could not confirm it is your computer',
      es: 'No se pudo confirmar que es tu computadora'
    },
    fix: {
      pt: 'Toque em Conectar de novo. Se continuar, abra o QR do computador outra vez.',
      en: 'Tap Connect again. If it continues, scan the computer’s QR again.',
      es: 'Toca Conectar de nuevo. Si continúa, escanea otra vez el QR de la computadora.'
    }
  },
  'HZ-607': {
    title: {
      pt: 'Este navegador não conseguiu abrir a tela',
      en: 'This browser could not open the screen',
      es: 'Este navegador no pudo abrir la pantalla'
    },
    fix: {
      pt: 'Atualize o aparelho ou use outro navegador.',
      en: 'Update the device or use another browser.',
      es: 'Actualiza el dispositivo o usa otro navegador.'
    }
  }
} satisfies Record<string, Entry>

export type ErrorCode = keyof typeof ERRORS

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERRORS, value)

/** A tabela dos códigos, no site. */
export const ERRORS_URL = 'https://horizonte-monitor.vercel.app/erros'
export const errorHelpUrl = (code: ErrorCode): string => `${ERRORS_URL}#${code}`

export const errorTitle = (code: ErrorCode): string => L(ERRORS[code].title)
export const errorFix = (code: ErrorCode): string => L(ERRORS[code].fix)
/** Corpo de uma janela de erro do sistema (quando a janela do app ainda não existe): o que fazer, o código e o site. */
export const errorDialogText = (code: ErrorCode): string =>
  `${errorFix(code)}\n\n${L({ pt: 'Código', en: 'Code', es: 'Código' })} ${code}: ${errorHelpUrl(code)}`

/** O que estava acontecendo quando deu erro; vira o código quando a causa não diz nada mais específico. */
export type ErrorOp =
  | 'prepare'
  | 'web-page'
  | 'answer'
  | 'connect'
  | 'disconnect'
  | 'mouse-unavailable'
  | 'mouse-start'
  | 'mouse-share'
  | 'update'

const OP_CODE: Record<ErrorOp, ErrorCode> = {
  prepare: 'HZ-101',
  'web-page': 'HZ-105',
  answer: 'HZ-304',
  connect: 'HZ-301',
  disconnect: 'HZ-306',
  'mouse-unavailable': 'HZ-401',
  'mouse-start': 'HZ-402',
  'mouse-share': 'HZ-403',
  update: 'HZ-501'
}

/** Causas conhecidas (o texto do erro, em qualquer idioma do sistema) que têm um código mais certeiro. */
const CAUSES: [RegExp, ErrorCode][] = [
  [/não achei o monitor virtual|o monitor virtual não apareceu/i, 'HZ-201'],
  [
    /pacote do driver veio incompleto|autorização para o certificado do monitor virtual|sem o driver do monitor virtual/i,
    'HZ-202'
  ],
  [/não tem como criar a tela estendida/i, 'HZ-203'],
  [/nenhuma tela para capturar/i, 'HZ-204'],
  [/EADDRINUSE|não deu para abrir a conexão/i, 'HZ-102'],
  [/ENOSPC|disco cheio/i, 'HZ-104'],
  [/EACCES|EPERM|EROFS|permission denied|sem permissão/i, 'HZ-103'],
  [/pedido (já )?não está mais|não está mais esperando resposta/i, 'HZ-305'],
  [/fechou a conexão/i, 'HZ-303'],
  [/não respondeu|não se apresentou a tempo/i, 'HZ-302']
]

export function errorCodeFor(op: ErrorOp | null, cause: string): ErrorCode {
  for (const [pattern, code] of CAUSES) if (pattern.test(cause)) return code
  return op ? OP_CODE[op] : 'HZ-100'
}
