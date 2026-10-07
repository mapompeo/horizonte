import type { Snapshot } from '../../shared/types'

export interface DiagnosticEnv {
  version: string
  platform: string
  arch: string
  osRelease: string
  electron: string
  /** Pasta pessoal da pessoa: some dos caminhos que aparecem nos erros. */
  home: string
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Troca a pasta pessoal por "~", com / ou \ e em qualquer caixa. Home curto demais (vazio, "/", "C:") não vale a troca. */
function hideHome(text: string, home: string): string {
  const clean = home.replace(/[\\/]+$/, '')
  if (clean.length < 4) return text
  const flexible = escapeRegExp(clean).replace(/\\\\|\//g, '[\\\\/]')
  return text.replace(new RegExp(flexible, 'gi'), '~')
}

/**
 * Cobertura deliberadamente limitada aos formatos usados nos erros de instalação/rede:
 * os dois argumentos de --creds (sem aspas, aspas simples/duplas, concatenação sh,
 * apóstrofos duplicados do PowerShell e escapes com barra invertida/backtick), userinfo
 * de URLs scheme://user:password@host e Authorization Basic/Bearer (texto ou JSON).
 * Não interpreta scripts nem decodifica comandos/headers codificados; não cobre segredos
 * arbitrários, query strings, cookies, outros esquemas de autenticação ou quoting malformado.
 */
function hideCredentials(text: string): string {
  const argument = String.raw`(?:'(?:[^']|'')*'|"(?:\\.|\x60.|[^"\\])*"|[\\\x60][^\r\n]|[^\s'"\\\x60;|&])+`
  return text
    .replace(
      new RegExp(String.raw`(--creds)[\t ]+${argument}[\t ]+${argument}`, 'gi'),
      '$1 [oculto] [oculto]'
    )
    .replace(/([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/?#]+@/gi, '$1[oculto]@')
    .replace(
      /(\bAuthorization["']?[\t ]*[:=][\t ]*["']?(?:Basic|Bearer)[\t ]+)[a-z\d._~+/=-]+/gi,
      '$1[oculto]'
    )
}

/**
 * Texto que a pessoa cola para pedir ajuda. Só entra o que ajuda a entender o problema: nunca o PIN, o número
 * do pedido, o nome de outros aparelhos nem endereços de rede; e os caminhos do erro não mostram o usuário.
 */
export function buildDiagnostic(env: DiagnosticEnv, snapshot: Snapshot): string {
  const { state, settings } = snapshot
  const mode = 'mode' in state ? ` (modo ${state.mode})` : ''
  const lines = [
    `Horizonte ${env.version}`,
    `Sistema: ${env.platform} ${env.arch} (${env.osRelease})`,
    `Electron ${env.electron}`,
    `Tela: ${state.screen}${mode}`
  ]
  if (state.screen === 'error') {
    lines.push(`Erro: ${hideCredentials(state.error.message)}`)
    if (state.error.detail) lines.push(`Detalhe: ${hideCredentials(state.error.detail)}`)
  }
  lines.push(
    `Qualidade: ${settings.bitrate} Mbps, ${settings.resolution}, ${settings.fps} fps, ${settings.codec}, codificação ${settings.encoding}`
  )
  return hideHome(lines.join('\n'), env.home)
}
