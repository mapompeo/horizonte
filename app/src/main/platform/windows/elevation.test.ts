import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildScript,
  createElevation,
  decodeCommand,
  ElevationError,
  psQuote,
  type ElevationRunner
} from './elevation'
import { DRIVER_INSTALL_SCRIPT } from './driver-script'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-elev-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Faz o papel do PowerShell elevado: decodifica o roteiro e grava o resultado que ele gravaria. */
function fakeRunner(result: string | null, seen: string[] = []): ElevationRunner {
  return async ({ encoded, resultPath }) => {
    seen.push(decodeCommand(encoded))
    if (result === null) return // o usuário recusou o UAC: o roteiro nunca rodou
    await mkdir(dirname(resultPath), { recursive: true })
    await writeFile(resultPath, result, 'utf8')
  }
}

const steps = [
  { description: 'Instalar o Sunshine', script: 'Write-Output um' },
  { description: 'Instalar o driver', script: 'Write-Output dois' }
]

describe('psQuote', () => {
  it('protege aspas e não deixa o PowerShell interpretar nada', () => {
    expect(psQuote("it's")).toBe("'it''s'")
    expect(psQuote('$(calc) `x`')).toBe("'$(calc) `x`'")
  })
})

describe('buildScript', () => {
  it('roda os passos na ordem e grava qual falhou', () => {
    const script = buildScript(steps, 'C:\\tmp\\result.txt')
    expect(script.indexOf('Write-Output um')).toBeLessThan(script.indexOf('Write-Output dois'))
    expect(script).toContain("$ErrorActionPreference = 'Stop'")
    expect(script).toContain("'C:\\tmp\\result.txt'")
    expect(script).toMatch(/fail:/)
  })
})

describe.runIf(process.platform === 'win32')('roteiro completo no PowerShell real', () => {
  it('preserva here-strings e grava sucesso depois de executar o bloco', async () => {
    const result = join(dir, 'real-result.txt')
    const script = buildScript(
      [
        {
          description: 'Texto literal',
          script:
            "$value = @'\nprimeira\nsegunda\n'@\nif ($value -ne \"primeira`nsegunda\") { throw 'Literal alterado' }"
        }
      ],
      result
    )
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      { timeout: 20_000, windowsHide: true }
    )
    expect((await readFile(result, 'utf8')).trim()).toBe('ok')
  }, 25_000)

  it('o roteiro completo do driver tem sintaxe válida antes de pedir administrador', () => {
    const script = buildScript(
      [{ description: 'Driver', script: DRIVER_INSTALL_SCRIPT }],
      join(dir, 'result.txt')
    )
    const checker =
      '$errors=$null; $tokens=$null; $script=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($env:HZ_SCRIPT)); [void][Management.Automation.Language.Parser]::ParseInput($script,[ref]$tokens,[ref]$errors); $errors.Count'
    const result = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', checker],
      {
        env: { ...process.env, HZ_SCRIPT: Buffer.from(script, 'utf16le').toString('base64') },
        encoding: 'utf8',
        timeout: 20_000,
        windowsHide: true
      }
    )
    expect(result.trim()).toBe('0')
  }, 25_000)
})

describe('createElevation', () => {
  it('uma só execução elevada para todos os passos', async () => {
    const seen: string[] = []
    const elevation = createElevation({ run: fakeRunner('ok', seen), tmpDir: dir })

    await elevation.runElevated(steps)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('Write-Output um')
    expect(seen[0]).toContain('Write-Output dois')
  })

  it('o UAC recusado vira erro de permissão negada', async () => {
    const elevation = createElevation({ run: fakeRunner(null), tmpDir: dir })
    const failure = await elevation.runElevated(steps).catch((cause: unknown) => cause)

    expect(failure).toBeInstanceOf(ElevationError)
    expect((failure as ElevationError).kind).toBe('denied')
    expect((failure as ElevationError).message).toMatch(/administrador/i)
  })

  it('um passo que falha diz qual foi e o motivo', async () => {
    const elevation = createElevation({ run: fakeRunner('fail:1:driver recusado'), tmpDir: dir })
    const failure = await elevation.runElevated(steps).catch((cause: unknown) => cause)

    expect((failure as ElevationError).kind).toBe('failed')
    expect((failure as ElevationError).message).toContain('Instalar o driver')
    expect((failure as ElevationError).message).toContain('driver recusado')
  })

  it('resultado ilegível não vale como sucesso', async () => {
    const elevation = createElevation({ run: fakeRunner('lixo'), tmpDir: dir })
    const failure = await elevation.runElevated(steps).catch((cause: unknown) => cause)

    expect((failure as ElevationError).kind).toBe('failed')
  })

  it('não deixa nenhum arquivo para trás, nem roteiro para ser trocado antes de rodar', async () => {
    await createElevation({ run: fakeRunner('ok'), tmpDir: dir }).runElevated(steps)
    await createElevation({ run: fakeRunner(null), tmpDir: dir })
      .runElevated(steps)
      .catch(() => undefined)

    expect(await readdir(dir)).toEqual([])
  })

  it('sem passos não pede administrador', async () => {
    const seen: string[] = []
    await createElevation({ run: fakeRunner('ok', seen), tmpDir: dir }).runElevated([])
    expect(seen).toEqual([])
  })

  it('roteiro grande demais para a linha de comando é recusado antes de pedir o UAC', async () => {
    const seen: string[] = []
    const elevation = createElevation({ run: fakeRunner('ok', seen), tmpDir: dir })
    const failure = await elevation
      .runElevated([{ description: 'x', script: 'a'.repeat(20_000) }])
      .catch((cause: unknown) => cause)

    expect((failure as ElevationError).kind).toBe('failed')
    expect(seen).toEqual([])
  })
})
