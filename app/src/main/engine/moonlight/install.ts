import { join } from 'node:path'

export interface MoonlightInstallDeps {
  /** Pasta própria do Horizonte onde o Moonlight portátil fica (sem administrador). */
  dir: string
  exists(path: string): Promise<boolean>
  /** Baixa o zip fixado, conferindo o hash, e devolve o caminho dele. */
  download(onProgress?: (fraction: number) => void): Promise<string>
  /** Extrai o zip para a pasta. */
  extract(zip: string, into: string): Promise<void>
}

/** Garante o Moonlight portátil e devolve o caminho do `Moonlight.exe`. Só baixa se ainda não estiver lá. */
export async function ensureMoonlight(
  deps: MoonlightInstallDeps,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const exe = join(deps.dir, 'Moonlight.exe')
  if (await deps.exists(exe)) return exe
  const zip = await deps.download(onProgress)
  await deps.extract(zip, deps.dir)
  if (!(await deps.exists(exe))) throw new Error('O pacote do Moonlight veio sem o Moonlight.exe.')
  return exe
}
