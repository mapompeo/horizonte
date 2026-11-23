import { sanitizeLog } from './diagnostic'

/**
 * Relatório para mandar a quem ajuda (pelo WhatsApp, e-mail): um arquivo de texto com o computador e o final dos
 * logs do app. Diferente do "Enviar diagnóstico" (só códigos, vai para o GitHub), este fica com a pessoa e ela
 * escolhe para quem manda; mesmo assim, a pasta pessoal e as senhas conhecidas saem do texto.
 */
export interface ReportFacts {
  version: string
  system: string
  memory: string
  cpu: string
  gpu: string
  displays: string[]
  /** Tela do app agora (preparando, conectado, erro...) e o modo. */
  state: string
  settings: string
}

export interface ReportLog {
  name: string
  /** Conteúdo do arquivo (o relatório fica só com as últimas linhas). */
  text: string | null
}

const TAIL_LINES = 400
/** O corpo de uma issue do GitHub aceita até 65 536 caracteres: o relatório cabe com folga. */
export const REPORT_MAX = 60_000

/**
 * O relatório vira uma issue pública: além da pasta pessoal e das senhas, saem o nome do computador e do usuário, os
 * nomes .local dos aparelhos (no iPhone e no iPad costumam ter o nome do dono) e o fim dos IPs da rede de casa.
 */
export function hidePrivate(text: string, secrets: string[]): string {
  let out = text
    .replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.x.x')
    .replace(/\b[a-z0-9][a-z0-9-]*\.local\b/gi, '[aparelho].local')
  for (const secret of secrets
    .filter((value) => value.trim().length >= 3)
    .sort((a, b) => b.length - a.length))
    out = out.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[oculto]')
  return out
}

export function lastLines(text: string, count = TAIL_LINES): string {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines.slice(-count).join('\n')
}

export function buildReportFile(
  facts: ReportFacts,
  logs: ReportLog[],
  home: string,
  now = new Date(),
  secrets: string[] = []
): string {
  const header = [
    // A primeira linha é a que o site confere para abrir a issue ("Horizonte <versão>").
    `Horizonte ${facts.version}`,
    `Relatório de ${now.toISOString()}`,
    '',
    `Sistema: ${facts.system}`,
    `Memória: ${facts.memory}`,
    `Processador: ${facts.cpu}`,
    `Placa de vídeo: ${facts.gpu}`,
    `Telas: ${facts.displays.join(' | ') || 'nenhuma'}`,
    `Agora: ${facts.state}`,
    `Ajustes: ${facts.settings}`
  ]
  // Logs grandes: menos linhas de cada um até o relatório caber numa issue.
  for (let lines = TAIL_LINES; ; lines = Math.floor(lines / 2)) {
    const sections = logs.map(
      (log) =>
        `\n===== ${log.name} (últimas linhas) =====\n${log.text ? lastLines(log.text, lines) : '(vazio ou não existe)'}`
    )
    const text = hidePrivate(sanitizeLog([...header, ...sections].join('\n') + '\n', home), secrets)
    if (text.length <= REPORT_MAX || lines <= 10) return text.slice(0, REPORT_MAX)
  }
}

/** Nome do arquivo na Área de Trabalho: Horizonte-relatorio-2026-11-23-0930.txt */
export function reportFileName(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `Horizonte-relatorio-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`
}
