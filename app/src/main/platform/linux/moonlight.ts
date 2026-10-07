import { posix } from 'node:path'
import { shQuote } from './setup'
import type { Artifact } from '../windows/download'
import type { PinnedArtifact } from '../windows/versions'

const join = posix.join

export interface LinuxMoonlightDeps {
  /** Pasta própria do Horizonte onde o Moonlight fica (sem administrador). */
  dir: string
  artifact: PinnedArtifact
  exists(path: string): Promise<boolean>
  /** Atômico e conferido por hash (`downloadVerified`): em qualquer falha nada fica no destino. */
  download(artifact: Artifact, dest: string, onProgress?: (fraction: number) => void): Promise<void>
  /** Roda um roteiro no `sh`, como a própria pessoa. */
  run(script: string): Promise<void>
}

/** Garante o Moonlight no Linux (AppImage, sem administrador) e devolve o caminho. */
export async function ensureMoonlightLinux(
  deps: LinuxMoonlightDeps,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const target = join(deps.dir, 'Moonlight.AppImage')
  if (!(await deps.exists(target))) {
    await deps.run(`mkdir -p ${shQuote(deps.dir)}`)
    await deps.download(deps.artifact, target, (f) => onProgress?.(f * 0.95))
    await deps.run(`chmod +x ${shQuote(target)}`)
  }
  onProgress?.(1)
  return target
}
