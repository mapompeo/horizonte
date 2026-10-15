/** Onde o outro computador fica em relação a este, para o mouse passar de um para o outro pela borda. */
export type MouseSide = 'left' | 'right' | 'above'

export const DESKFLOW_PORT = 24800

const OPPOSITE: Record<MouseSide, string> = { left: 'right', right: 'left', above: 'down' }
const EDGE: Record<MouseSide, string> = { left: 'left', right: 'right', above: 'up' }

/** Nomes do Deskflow não aceitam espaço nem caracteres especiais: troca por hífen e corta em 63. */
export function computerName(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
  return clean || 'Horizonte'
}

/**
 * Layout do servidor (só as ligações; os computadores ficam nos ajustes desde o Deskflow 1.27). `side` diz onde
 * o outro computador fica: à direita, o mouse sai pela borda direita deste e entra pela esquerda do outro.
 */
export function linksConfig(server: string, client: string, side: MouseSide): string {
  return [
    'section: links',
    `\t${server}:`,
    `\t\t${EDGE[side]} = ${client}`,
    `\t${client}:`,
    `\t\t${OPPOSITE[side]} = ${server}`,
    'end',
    ''
  ].join('\n')
}

export interface ServerSettings {
  role: 'server'
  name: string
  peerName: string
  /** Caminho do arquivo de ligações, com barras normais (o Deskflow aceita no Windows também). */
  linksFile: string
}

export interface ClientSettings {
  role: 'client'
  name: string
  serverAddress: string
}

/**
 * Ajustes do Deskflow (formato INI do QSettings). TLS fica desligado aqui: o Horizonte decide quem conecta em quem
 * pelo próprio canal e a rede é a local; a área de transferência vai junto com o mouse.
 */
export function deskflowSettings(input: ServerSettings | ClientSettings): string {
  const lines = [
    '[core]',
    `coreMode=${input.role === 'server' ? 2 : 1}`,
    `computerName=${computerName(input.name)}`,
    `port=${DESKFLOW_PORT}`,
    'enableUpdateCheck=false'
  ]
  if (input.role === 'server') {
    const self = computerName(input.name)
    const peer = computerName(input.peerName)
    lines.push(
      '[server]',
      'externalConfig=true',
      `externalConfigFile=${input.linksFile.replace(/\\/g, '/')}`,
      'enableClipboard=true',
      `[computer_${self}]`,
      `name=${self}`,
      `[computer_${peer}]`,
      `name=${peer}`
    )
  } else {
    lines.push('[client]', `remoteHost=${input.serverAddress}`)
  }
  lines.push('[security]', 'tlsEnabled=false', 'checkPeerFingerprints=false', '')
  return lines.join('\n')
}
