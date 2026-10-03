import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

export type ElevationErrorKind = 'denied' | 'failed'

export class ElevationError extends Error {
  constructor(
    readonly kind: ElevationErrorKind,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ElevationError'
  }
}

export interface ElevatedStep {
  /** Frase curta para a mensagem de erro, por exemplo "Instalar o Sunshine". */
  description: string
  /** Trecho de PowerShell. Valores vindos de fora devem passar por `psQuote`. */
  script: string
}

export interface Elevation {
  /** Roda todos os passos com UM pedido de administrador. Para no primeiro que falhar. */
  runElevated(steps: ElevatedStep[]): Promise<void>
}

/** Executa o roteiro como administrador. Não devolve nada: o resultado vem no arquivo `resultPath`. */
export type ElevationRunner = (command: { encoded: string; resultPath: string }) => Promise<void>

/**
 * A linha de comando do Windows aceita ~32 mil caracteres; o limite deixa margem para o resto do comando.
 */
const MAX_ENCODED_LENGTH = 24_000

/** O PowerShell 5 grava UTF-8 com BOM. */
const BOM = String.fromCharCode(0xfeff)

/** Literal de texto do PowerShell: aspas simples duplicadas, nada é interpretado dentro dele. */
export const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`

export function buildScript(steps: ElevatedStep[], resultPath: string): string {
  const body = steps
    .map(
      (step, index) =>
        `    $step = ${index}\n${step.script
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')}`
    )
    .join('\n')
  return [
    "$ErrorActionPreference = 'Stop'",
    `$result = ${psQuote(resultPath)}`,
    '$step = 0',
    'try {',
    body,
    "    Set-Content -LiteralPath $result -Value 'ok' -Encoding ascii",
    '} catch {',
    '    $message = ($_.Exception.Message -replace "[\\r\\n]+", " ")',
    '    Set-Content -LiteralPath $result -Value ("fail:" + $step + ":" + $message) -Encoding utf8',
    '}'
  ].join('\n')
}

export const encodeCommand = (script: string): string =>
  Buffer.from(script, 'utf16le').toString('base64')

export const decodeCommand = (encoded: string): string =>
  Buffer.from(encoded, 'base64').toString('utf16le')

/**
 * O roteiro vai direto na linha de comando (`-EncodedCommand`) e não num arquivo `.ps1`: um arquivo
 * numa pasta do usuário poderia ser trocado entre ser gravado e ser executado como administrador.
 */
export function createElevation(deps: { run: ElevationRunner; tmpDir: string }): Elevation {
  return {
    async runElevated(steps) {
      if (steps.length === 0) return
      const folder = await mkdtemp(join(deps.tmpDir, 'horizonte-uac-'))
      try {
        const resultPath = join(folder, 'result.txt')
        const encoded = encodeCommand(buildScript(steps, resultPath))
        if (encoded.length > MAX_ENCODED_LENGTH) {
          throw new ElevationError('failed', 'Os passos de instalação ficaram grandes demais.')
        }

        await deps.run({ encoded, resultPath })

        const raw = await readFile(resultPath, 'utf8').catch(() => null)
        if (raw === null) {
          // Sem resultado o roteiro nunca rodou: o pedido de administrador foi recusado.
          throw new ElevationError(
            'denied',
            'Preciso da permissão de administrador para instalar. Tente de novo e aceite o aviso do Windows.'
          )
        }
        const text = (raw.startsWith(BOM) ? raw.slice(1) : raw).trim()
        if (text === 'ok') return
        const failed = /^fail:(\d+):(.*)$/s.exec(text)
        const step = failed ? steps[Number(failed[1])] : undefined
        throw new ElevationError(
          'failed',
          step
            ? `Não consegui concluir o passo "${step.description}": ${failed?.[2]?.trim() ?? ''}`
            : 'A instalação terminou de um jeito que não consegui entender.'
        )
      } finally {
        await rm(folder, { recursive: true, force: true })
      }
    }
  }
}

/** Abre o PowerShell elevado (aviso do Windows) e espera ele terminar. Só funciona no Windows. */
export const runWithUac: ElevationRunner = ({ encoded }) =>
  new Promise((resolve) => {
    const launcher =
      'Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden ' +
      `-ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`
    // Recusar o aviso faz o PowerShell sair com erro; isso é detectado pela falta do arquivo de resultado.
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcher], () =>
      resolve()
    )
  })
