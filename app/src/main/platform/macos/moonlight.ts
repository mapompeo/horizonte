import { posix } from 'node:path'
import { shQuote } from '../linux/setup'
import type { Artifact } from '../windows/download'
import type { PinnedArtifact } from '../windows/versions'

const join = posix.join

export interface MacMoonlightDeps {
  /** Pasta própria do Horizonte onde o Moonlight.app fica (sem administrador). */
  dir: string
  /** Onde o disco baixado fica enquanto é instalado. */
  workDir: string
  artifact: PinnedArtifact
  exists(path: string): Promise<boolean>
  download(
    artifact: Artifact & { fileName?: string },
    dest: string,
    onProgress?: (fraction: number) => void
  ): Promise<void>
  /** Roda um roteiro no `sh`, como a própria pessoa, e devolve o que ele imprimiu. */
  run(script: string): Promise<string>
}

/** O executável vem do Info.plist do próprio app; só nome simples, nunca um caminho. */
const SIMPLE_NAME = /^[A-Za-z0-9._ -]+$/

/**
 * Garante o Moonlight no Mac e devolve o caminho do executável. Monta o disco, acha o `.app` que estiver nele
 * (sem assumir o nome) e copia para a pasta do Horizonte. Só baixa se ainda não estiver lá.
 */
export async function ensureMoonlightMac(
  deps: MacMoonlightDeps,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const app = join(deps.dir, 'Moonlight.app')
  const plist = join(app, 'Contents', 'Info.plist')

  const executable = async (): Promise<string> => {
    const name = (
      await deps.run(`plutil -extract CFBundleExecutable raw -o - ${shQuote(plist)}`)
    ).trim()
    if (!SIMPLE_NAME.test(name) || name === '.' || name === '..') {
      throw new Error('O Moonlight instalado tem um Info.plist que o Horizonte não entende.')
    }
    return join(app, 'Contents', 'MacOS', name)
  }

  const installed = (await deps.exists(plist)) && (await deps.exists(await executable()))
  if (!installed) {
    const file = join(deps.workDir, deps.artifact.fileName)
    await deps.download(deps.artifact, file, (f) => onProgress?.(f * 0.8))
    await deps.run(
      [
        'set -e',
        'mnt=$(mktemp -d)',
        'trap \'hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true\' EXIT',
        `hdiutil attach ${shQuote(file)} -nobrowse -readonly -quiet -mountpoint "$mnt"`,
        `app=$(find "$mnt" -maxdepth 2 -name '*.app' -type d | head -n 1)`,
        'test -n "$app"',
        `mkdir -p ${shQuote(deps.dir)}`,
        `rm -rf ${shQuote(app)}`,
        `cp -R "$app" ${shQuote(app)}`
      ].join('\n')
    )
    onProgress?.(0.95)
  }

  const path = await executable()
  if (!(await deps.exists(path))) throw new Error('O pacote do Moonlight veio sem o executável.')
  onProgress?.(1)
  return path
}
