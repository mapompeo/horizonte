import type { ScreenSize } from '../../../shared/types'

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

/** Trecho de cada borda que se encosta, em % (0 a 100) do comprimento da borda de cada computador. */
export interface EdgeRanges {
  own: [number, number]
  peer: [number, number]
}

/**
 * Onde as bordas se encostam. `offset` é onde começa a borda do outro computador, em fração da borda deste
 * (0: alinhados no topo ou à esquerda; negativo: o outro começa antes). Sem `offset`, ficam centralizados.
 * Sempre sobra um pedaço encostado, para o mouse ter por onde passar.
 */
export function edgeRanges(
  side: MouseSide,
  own: ScreenSize,
  peer: ScreenSize,
  offset?: number
): EdgeRanges {
  const ownEdge = side === 'above' ? own.width : own.height
  const peerEdge = side === 'above' ? peer.width : peer.height
  const centered = (ownEdge - peerEdge) / 2
  const minimum = Math.min(ownEdge, peerEdge) * 0.05
  const start = Math.min(
    Math.max(offset === undefined ? centered : offset * ownEdge, minimum - peerEdge),
    ownEdge - minimum
  )
  const from = Math.max(0, start)
  const to = Math.min(ownEdge, start + peerEdge)
  const pct = (value: number, edge: number): number =>
    Math.min(100, Math.max(0, Math.round((value / edge) * 100)))
  return {
    own: [pct(from, ownEdge), pct(to, ownEdge)],
    peer: [pct(from - start, peerEdge), pct(to - start, peerEdge)]
  }
}

const range = ([from, to]: [number, number]): string =>
  from === 0 && to === 100 ? '' : `(${from},${to})`

/**
 * Layout do servidor (só as ligações; os computadores ficam nos ajustes desde o Deskflow 1.27). `side` diz onde
 * o outro computador fica: à direita, o mouse sai pela borda direita deste e entra pela esquerda do outro.
 * `ranges` limita o trecho de cada borda que se encosta (o outro computador mais acima ou mais abaixo).
 */
export function linksConfig(
  server: string,
  client: string,
  side: MouseSide,
  ranges: EdgeRanges = { own: [0, 100], peer: [0, 100] }
): string {
  const own = range(ranges.own)
  const peer = range(ranges.peer)
  return [
    'section: links',
    `\t${server}:`,
    `\t\t${EDGE[side]}${own} = ${client}${peer}`,
    `\t${client}:`,
    `\t\t${OPPOSITE[side]}${peer} = ${server}${own}`,
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
