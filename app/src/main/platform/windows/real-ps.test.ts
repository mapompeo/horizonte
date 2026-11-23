import { execFile } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createElevation, ElevationError, psQuote, type ElevationRunner } from './elevation'

/** Roda o roteiro no PowerShell de verdade, SEM administrador: prova a sintaxe e o arquivo de resultado. */
const runPlain: ElevationRunner = ({ encoded }) =>
  new Promise((resolve) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], () =>
      resolve()
    )
  )

describe.skipIf(process.platform !== 'win32')('roteiro no PowerShell real', () => {
  it('passos que dão certo terminam em sucesso e respeitam o valor entre aspas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'horizonte-ps-'))
    try {
      const marker = join(dir, "com ' aspa e $(nao-executa).txt")
      await createElevation({ run: runPlain, tmpDir: dir }).runElevated([
        {
          description: 'Criar arquivo',
          script: `New-Item -ItemType File -Path ${psQuote(marker)} | Out-Null`
        },
        {
          description: 'Conferir',
          script: `if (-not (Test-Path -LiteralPath ${psQuote(marker)})) { throw 'sumiu' }`
        }
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it('o passo que falha é o apontado e os seguintes não rodam', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'horizonte-ps-'))
    try {
      const never = join(dir, 'nunca.txt')
      const failure = await createElevation({ run: runPlain, tmpDir: dir })
        .runElevated([
          { description: 'Primeiro', script: "Write-Output 'ok'" },
          { description: 'Segundo', script: "throw 'deu ruim\nem duas linhas'" },
          { description: 'Terceiro', script: `New-Item -ItemType File -Path ${psQuote(never)}` }
        ])
        .catch((cause: unknown) => cause)

      expect(failure).toBeInstanceOf(ElevationError)
      expect((failure as ElevationError).message).toContain('Segundo')
      expect((failure as ElevationError).message).toContain('deu ruim')
      await expect(access(never)).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
