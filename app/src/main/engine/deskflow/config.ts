import type { MouseSide, ScreenSize } from '../../../shared/types'

export type { MouseSide }

export const DESKFLOW_PORT = 24800

const EDGE: Record<MouseSide, string> = { left: 'left', right: 'right', above: 'up', below: 'down' }
const OPPOSITE: Record<MouseSide, string> = {
  left: 'right',
  right: 'left',
  above: 'down',
  below: 'up'
}

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

const horizontal = (side: MouseSide): boolean => side === 'above' || side === 'below'

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
  const ownEdge = horizontal(side) ? own.width : own.height
  const peerEdge = horizontal(side) ? peer.width : peer.height
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

/** Um computador encostado neste: de que lado e em que trecho das bordas. */
export interface DeskflowLink {
  name: string
  side: MouseSide
  ranges?: EdgeRanges
}

/**
 * Layout do servidor (só as ligações; os computadores ficam nos ajustes desde o Deskflow 1.27). Cada ligação diz
 * onde o outro computador fica: à direita, o mouse sai pela borda direita deste e entra pela esquerda do outro.
 * `ranges` limita o trecho de cada borda que se encosta (o outro computador mais acima ou mais abaixo).
 */
export function linksConfig(server: string, links: DeskflowLink[]): string {
  const full: EdgeRanges = { own: [0, 100], peer: [0, 100] }
  const lines = ['section: links', `\t${server}:`]
  for (const { name, side, ranges = full } of links)
    lines.push(`\t\t${EDGE[side]}${range(ranges.own)} = ${name}${range(ranges.peer)}`)
  for (const { name, side, ranges = full } of links)
    lines.push(
      `\t${name}:`,
      `\t\t${OPPOSITE[side]}${range(ranges.peer)} = ${server}${range(ranges.own)}`
    )
  lines.push('end', '')
  return lines.join('\n')
}

export interface ServerSettings {
  role: 'server'
  name: string
  peerNames: string[]
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
    lines.push(
      '[server]',
      'externalConfig=true',
      `externalConfigFile=${input.linksFile.replace(/\\/g, '/')}`,
      'enableClipboard=true'
    )
    for (const name of [input.name, ...input.peerNames].map(computerName))
      lines.push(`[computer_${name}]`, `name=${name}`)
  } else {
    lines.push('[client]', `remoteHost=${input.serverAddress}`)
  }
  lines.push('[security]', 'tlsEnabled=false', 'checkPeerFingerprints=false', '')
  return lines.join('\n')
}
