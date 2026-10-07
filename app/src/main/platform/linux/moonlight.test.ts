import { describe, expect, it } from 'vitest'
import { ensureMoonlightLinux, type LinuxMoonlightDeps } from './moonlight'

const ARTIFACT = {
  version: '6.1.0',
  fileName: 'Moonlight-6.1.0-x86_64.AppImage',
  url: 'https://example.test/Moonlight.AppImage',
  sha256: 'abc'
}

function setup(installed = false): {
  deps: LinuxMoonlightDeps
  downloads: string[]
  scripts: string[]
  files: Set<string>
} {
  const files = new Set<string>()
  const downloads: string[] = []
  const scripts: string[] = []
  if (installed) files.add('/home/ana/.config/horizonte/moonlight/Moonlight.AppImage')
  return {
    files,
    downloads,
    scripts,
    deps: {
      dir: '/home/ana/.config/horizonte/moonlight',
      artifact: ARTIFACT,
      exists: async (path) => files.has(path),
      download: async (_artifact, dest, onProgress) => {
        downloads.push(dest)
        files.add(dest)
        onProgress?.(1)
      },
      run: async (script) => {
        scripts.push(script)
      }
    }
  }
}

describe('ensureMoonlightLinux', () => {
  it('baixa o AppImage para a pasta do Horizonte, deixa executável e devolve o caminho', async () => {
    const { deps, downloads, scripts } = setup()
    const path = await ensureMoonlightLinux(deps)
    expect(path).toBe('/home/ana/.config/horizonte/moonlight/Moonlight.AppImage')
    expect(downloads).toHaveLength(1)
    expect(scripts.join('\n')).toContain('chmod +x')
  })

  it('já instalado: não baixa de novo', async () => {
    const { deps, downloads } = setup(true)
    await ensureMoonlightLinux(deps)
    expect(downloads).toHaveLength(0)
  })

  it('o caminho com aspas vai protegido no roteiro', async () => {
    const { deps, scripts } = setup()
    deps.dir = "/home/o'brien/moonlight"
    await ensureMoonlightLinux(deps)
    expect(scripts.join('\n')).toContain("o'\\''brien")
  })

  it('o progresso termina em 1', async () => {
    const { deps } = setup()
    const seen: number[] = []
    await ensureMoonlightLinux(deps, (f) => seen.push(f))
    expect(seen.at(-1)).toBe(1)
  })
})
