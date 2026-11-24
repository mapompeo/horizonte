import { L, type Lang } from './lang'

/**
 * Os erros que a pessoa vê, cada um com um código (número de 3 dígitos), um título que diz o que aconteceu e uma frase que diz o
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
  '100': {
    title: { pt: 'Algo deu errado', en: 'Something went wrong', es: 'Algo salió mal' },
    fix: RESTART
  },
  // 1xx: preparar este computador
  '101': {
    title: {
      pt: 'Não deu para preparar a tela',
      en: 'Could not get the screen ready',
      es: 'No se pudo preparar la pantalla'
    },
    fix: RESTART
  },
  '102': {
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
  '103': {
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
  '104': {
    title: { pt: 'O disco está cheio', en: 'The disk is full', es: 'El disco está lleno' },
    fix: {
      pt: 'Libere espaço no disco e tente de novo.',
      en: 'Free up disk space and try again.',
      es: 'Libera espacio en el disco e inténtalo de nuevo.'
    }
  },
  '105': {
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
  '106': {
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
  '107': {
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
  '108': {
    title: {
      pt: 'O computador ficou sem memória',
      en: 'The computer ran out of memory',
      es: 'La computadora se quedó sin memoria'
    },
    fix: {
      pt: 'Feche outros programas e tente de novo.',
      en: 'Close other programs and try again.',
      es: 'Cierra otros programas e inténtalo de nuevo.'
    }
  },
  '109': {
    title: {
      pt: 'O firewall bloqueou o Horizonte',
      en: 'The firewall blocked Horizonte',
      es: 'El firewall bloqueó Horizonte'
    },
    fix: {
      pt: 'Toque em Liberar no aviso do Horizonte e confirme a senha do sistema.',
      en: 'Tap Allow on the Horizonte notice and confirm the system password.',
      es: 'Toca Permitir en el aviso de Horizonte y confirma la contraseña del sistema.'
    }
  },
  // 2xx: a tela estendida
  '201': {
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
  '202': {
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
  '203': {
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
  '204': {
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
  '205': {
    title: {
      pt: 'O sistema negou a captura da tela',
      en: 'The system denied the screen capture',
      es: 'El sistema negó la captura de la pantalla'
    },
    fix: {
      pt: 'Libere a gravação de tela para o Horizonte nos ajustes do sistema e abra o Horizonte de novo.',
      en: 'Allow screen recording for Horizonte in the system settings and open Horizonte again.',
      es: 'Permite la grabación de pantalla para Horizonte en los ajustes del sistema y abre Horizonte de nuevo.'
    }
  },
  '206': {
    title: {
      pt: 'A captura da tela não começou',
      en: 'The screen capture did not start',
      es: 'La captura de la pantalla no comenzó'
    },
    fix: {
      pt: 'Feche programas que gravam a tela e tente de novo. Se continuar, reinicie o computador.',
      en: 'Close programs that record the screen and try again. If it continues, restart the computer.',
      es: 'Cierra los programas que graban la pantalla e inténtalo de nuevo. Si continúa, reinicia la computadora.'
    }
  },
  '207': {
    title: {
      pt: 'O vídeo da tela não pôde ser codificado',
      en: 'The screen video could not be encoded',
      es: 'El video de la pantalla no se pudo codificar'
    },
    fix: {
      pt: 'Atualize o driver de vídeo e o Horizonte, e tente de novo.',
      en: 'Update the video driver and Horizonte, and try again.',
      es: 'Actualiza el controlador de video y Horizonte, e inténtalo de nuevo.'
    }
  },
  '208': {
    title: {
      pt: 'A janela de transmissão parou',
      en: 'The streaming window stopped',
      es: 'La ventana de transmisión se detuvo'
    },
    fix: RESTART
  },
  // 3xx: a conexão entre os aparelhos
  '301': {
    title: { pt: 'Não deu para conectar', en: 'Could not connect', es: 'No se pudo conectar' },
    fix: SAME_NETWORK
  },
  '302': {
    title: {
      pt: 'O outro aparelho não respondeu',
      en: 'The other device did not answer',
      es: 'El otro dispositivo no respondió'
    },
    fix: SAME_NETWORK
  },
  '303': {
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
  '304': {
    title: {
      pt: 'Não deu para responder ao pedido',
      en: 'Could not answer the request',
      es: 'No se pudo responder la solicitud'
    },
    fix: ASK_AGAIN
  },
  '305': {
    title: {
      pt: 'O pedido não vale mais',
      en: 'The request is no longer valid',
      es: 'La solicitud ya no es válida'
    },
    fix: ASK_AGAIN
  },
  '306': {
    title: {
      pt: 'Não deu para desconectar',
      en: 'Could not disconnect',
      es: 'No se pudo desconectar'
    },
    fix: RESTART
  },
  '307': {
    title: {
      pt: 'Não achei caminho de rede até o outro aparelho',
      en: 'No network path to the other device was found',
      es: 'No se encontró camino de red hasta el otro dispositivo'
    },
    fix: {
      pt: 'Conecte os dois na mesma rede Wi-Fi e desligue VPN e rede de convidados.',
      en: 'Connect both to the same Wi-Fi network and turn off VPNs and guest networks.',
      es: 'Conecta los dos a la misma red Wi-Fi y apaga las VPN y la red de invitados.'
    }
  },
  '308': {
    title: {
      pt: 'A conexão caiu no meio do uso',
      en: 'The connection dropped during use',
      es: 'La conexión se cayó en pleno uso'
    },
    fix: {
      pt: 'Chegue mais perto do roteador Wi-Fi e conecte de novo.',
      en: 'Move closer to the Wi-Fi router and connect again.',
      es: 'Acércate al router Wi-Fi y conéctate de nuevo.'
    }
  },
  '309': {
    title: {
      pt: 'O outro aparelho não está esperando conexão',
      en: 'The other device is not waiting for a connection',
      es: 'El otro dispositivo no está esperando conexión'
    },
    fix: {
      pt: 'Abra o Horizonte no outro aparelho e escolha Enviar.',
      en: 'Open Horizonte on the other device and choose Send.',
      es: 'Abre Horizonte en el otro dispositivo y elige Enviar.'
    }
  },
  '310': {
    title: {
      pt: 'Os aparelhos têm versões diferentes do Horizonte',
      en: 'The devices have different versions of Horizonte',
      es: 'Los dispositivos tienen versiones distintas de Horizonte'
    },
    fix: {
      pt: 'Atualize o Horizonte nos dois aparelhos.',
      en: 'Update Horizonte on both devices.',
      es: 'Actualiza Horizonte en los dos dispositivos.'
    }
  },
  '311': {
    title: {
      pt: 'O outro aparelho já está ocupado',
      en: 'The other device is already busy',
      es: 'El otro dispositivo ya está ocupado'
    },
    fix: {
      pt: 'Espere ele terminar de mostrar a tela em outro lugar e conecte de novo.',
      en: 'Wait for it to finish showing the screen elsewhere and connect again.',
      es: 'Espera a que termine de mostrar la pantalla en otro lugar y conéctate de nuevo.'
    }
  },
  '312': {
    title: {
      pt: 'O outro aparelho não permitiu a conexão',
      en: 'The other device did not allow the connection',
      es: 'El otro dispositivo no permitió la conexión'
    },
    fix: {
      pt: 'Conecte de novo e escolha Permitir no outro aparelho.',
      en: 'Connect again and choose Allow on the other device.',
      es: 'Conéctate de nuevo y elige Permitir en el otro dispositivo.'
    }
  },
  // 4xx: o mouse compartilhado
  '401': {
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
  '402': {
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
  '403': {
    title: {
      pt: 'Não deu para compartilhar o mouse',
      en: 'Could not share the mouse',
      es: 'No se pudo compartir el mouse'
    },
    fix: SAME_NETWORK
  },
  '404': {
    title: {
      pt: 'Nenhum computador está perto deste',
      en: 'No computer is placed next to this one',
      es: 'Ninguna computadora está junto a esta'
    },
    fix: {
      pt: 'Arraste um computador para perto deste e tente de novo.',
      en: 'Drag a computer next to this one and try again.',
      es: 'Arrastra una computadora junto a esta e inténtalo de nuevo.'
    }
  },
  '405': {
    title: {
      pt: 'O arquivo copiado chegou incompleto',
      en: 'The copied file arrived incomplete',
      es: 'El archivo copiado llegó incompleto'
    },
    fix: {
      pt: 'Copie o arquivo de novo.',
      en: 'Copy the file again.',
      es: 'Copia el archivo de nuevo.'
    }
  },
  '406': {
    title: {
      pt: 'O outro computador ainda não compartilha o mouse',
      en: 'The other computer cannot share the mouse yet',
      es: 'La otra computadora aún no comparte el mouse'
    },
    fix: {
      pt: 'Atualize o Horizonte no outro computador.',
      en: 'Update Horizonte on the other computer.',
      es: 'Actualiza Horizonte en la otra computadora.'
    }
  },
  '407': {
    title: {
      pt: 'Nenhum computador respondeu ao mouse',
      en: 'No computer answered the mouse request',
      es: 'Ninguna computadora respondió al mouse'
    },
    fix: {
      pt: 'Abra o Horizonte no modo Mouse nos outros computadores e tente de novo.',
      en: 'Open Horizonte in Mouse mode on the other computers and try again.',
      es: 'Abre Horizonte en modo Mouse en las otras computadoras e inténtalo de nuevo.'
    }
  },
  // 5xx: atualizações
  '501': {
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
  '502': {
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
  '503': {
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
  '601': {
    title: {
      pt: 'O computador não respondeu',
      en: 'The computer did not answer',
      es: 'La computadora no respondió'
    },
    fix: SENDING_OPEN
  },
  '602': {
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
  '603': {
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
  '604': {
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
  '605': {
    title: { pt: 'A conexão caiu', en: 'The connection dropped', es: 'Se cayó la conexión' },
    fix: {
      pt: 'Toque em Conectar.',
      en: 'Tap Connect.',
      es: 'Toca Conectar.'
    }
  },
  '606': {
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
  '607': {
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
  },
  // A página abriu e o computador aceitou, mas a imagem não chega (captura da tela parada no computador, rede ruim).
  // Aparece no aparelho e no computador; antes era o "?" do Safari, ou "Abrindo a tela…" para sempre.
  '608': {
    title: {
      pt: 'A imagem da tela não chegou ao aparelho',
      en: 'The screen image did not reach the device',
      es: 'La imagen de la pantalla no llegó al dispositivo'
    },
    fix: {
      pt: 'Feche e abra o Horizonte no computador e toque em Conectar no aparelho.',
      en: 'Close and open Horizonte on the computer and tap Connect on the device.',
      es: 'Cierra y abre Horizonte en la computadora y toca Conectar en el dispositivo.'
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
  | 'capture'
  | 'mouse-unavailable'
  | 'mouse-start'
  | 'mouse-share'
  | 'update'

const OP_CODE: Record<ErrorOp, ErrorCode> = {
  prepare: '101',
  'web-page': '105',
  answer: '304',
  connect: '301',
  disconnect: '306',
  capture: '206',
  'mouse-unavailable': '401',
  'mouse-start': '402',
  'mouse-share': '403',
  update: '501'
}

/** Causas conhecidas (o texto do erro, em qualquer idioma do sistema) que têm um código mais certeiro. */
const CAUSES: [RegExp, ErrorCode][] = [
  [/não achei o monitor virtual|o monitor virtual não apareceu/i, '201'],
  [
    /pacote do driver veio incompleto|autorização para o certificado do monitor virtual|sem o driver do monitor virtual/i,
    '202'
  ],
  [/não tem como criar a tela estendida/i, '203'],
  [/nenhuma tela para capturar/i, '204'],
  // A captura negada vem do navegador do motor (só "Permission denied"); a de arquivo vem com EACCES e o caminho.
  [/NotAllowedError|(^|[:\s])permission denied\s*$/i, '205'],
  [/NotReadableError|AbortError|NotFoundError|could not start video source/i, '206'],
  [/EncodingError|OperationError|encoder|codec/i, '207'],
  [/janela de transmissão parou|render-process-gone/i, '208'],
  [/ENOMEM|out of memory|sem memória/i, '108'],
  [/firewall|preferiu não liberar/i, '109'],
  [/EADDRINUSE|não deu para abrir a conexão/i, '102'],
  [/ENOSPC|disco cheio/i, '104'],
  [/EACCES|EPERM|EROFS|permission denied|sem permissão/i, '103'],
  [/pedido (já )?não está mais|não está mais esperando resposta/i, '305'],
  [/versões diferentes/i, '310'],
  [/já está mostrando a tela em outro lugar/i, '311'],
  [/não permitiu a conexão/i, '312'],
  [/não está esperando conexão|ECONNREFUSED/i, '309'],
  [/não achei caminho de rede/i, '307'],
  [/a conexão caiu/i, '308'],
  [/fechou a conexão/i, '303'],
  [/arraste um computador/i, '404'],
  [/chegou incompleto/i, '405'],
  [/ainda não consegue compartilhar o mouse/i, '406'],
  [/nenhum computador respondeu/i, '407'],
  [/não respondeu|não se apresentou a tempo/i, '302']
]

export function errorCodeFor(op: ErrorOp | null, cause: string): ErrorCode {
  for (const [pattern, code] of CAUSES) if (pattern.test(cause)) return code
  return op ? OP_CODE[op] : '100'
}
