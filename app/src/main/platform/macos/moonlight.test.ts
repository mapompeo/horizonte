import { describe, expect, it } from 'vitest'
import { ensureMoonlightMac, type MacMoonlightDeps } from './moonlight'

const ARTIFACT = {
  version: '6.1.0',
  fileName: 'Moonlight-6.1.0.dmg',
  url: 'https://example.test/Moonlight-6.1.0.dmg',
  sha256: 'abc'
}

interface Fake {
  deps: MacMoonlightDeps
  scripts: string[]
  downloads: string[]
  files: Set<string>
}

function setup(
  options: { installed?: boolean; executable?: string; withBinary?: boolean } = {}
): Fake {
  const files = new Set<string>()
  const scripts: string[] = []
  const downloads: string[] = []
  const executable = options.executable ?? 'Moonlight'
  const app = '/Users/ana/Library/Application Support/horizonte/Moonlight.app'
  if (options.installed) {
    files.add(`${app}/Contents/Info.plist`)
    files.add(`${app}/Contents/MacOS/${executable}`)
  }
  const deps: MacMoonlightDeps = {
    dir: '/Users/ana/Library/Application Support/horizonte',
    workDir: '/tmp',
    artifact: ARTIFACT,
    exists: async (path) => files.has(path),
    download: async (_artifact, dest, onProgress) => {
      downloads.push(dest)
      onProgress?.(0.5)
      onProgress?.(1)
    },
    run: async (script) => {
      scripts.push(script)
      if (script.includes('plutil')) return `${executable}\n`
      // O roteiro de instalação: depois dele o app está no lugar.
      files.add(`${app}/Contents/Info.plist`)
      if (options.withBinary !== false) files.add(`${app}/Contents/MacOS/${executable}`)
      return ''
    }
  }
  return { deps, scripts, downloads, files }
}

describe('ensureMoonlightMac', () => {
  it('recupera instalação parcial com plist presente e binário ausente', async () => {
    const t = setup({ installed: true })
    const binary =
      '/Users/ana/Library/Application Support/horizonte/Moonlight.app/Contents/MacOS/Moonlight'
    t.files.delete(binary)
    await expect(ensureMoonlightMac(t.deps)).resolves.toBe(binary)
    expect(t.files.has(binary)).toBe(true)
    expect(t.downloads).toHaveLength(1)
  })

  it('já instalado: devolve o executável sem baixar nada', async () => {
    const t = setup({ installed: true })
    const exe = await ensureMoonlightMac(t.deps)
    expect(exe).toBe(
      '/Users/ana/Library/Application Support/horizonte/Moonlight.app/Contents/MacOS/Moonlight'
    )
    expect(t.downloads).toEqual([])
    expect(t.scripts.every((s) => s.includes('plutil'))).toBe(true)
  })

  it('primeira vez: baixa o disco fixado e instala sem pedir administrador', async () => {
    const t = setup()
    const progress: number[] = []
    const exe = await ensureMoonlightMac(t.deps, (f) => progress.push(f))
    expect(t.downloads).toEqual(['/tmp/Moonlight-6.1.0.dmg'])
    expect(exe).toMatch(/Moonlight\.app\/Contents\/MacOS\/Moonlight$/)
    const install = t.scripts.find((s) => s.includes('hdiutil attach')) ?? ''
    expect(install).toContain('set -e')
    expect(install).toContain('-nobrowse -readonly')
    expect(install).toContain('hdiutil detach')
    expect(install).toContain('cp -R')
    expect(install).not.toContain('sudo')
    expect(progress.length).toBeGreaterThan(0)
    expect(Math.max(...progress)).toBeLessThanOrEqual(1)
  })

  it('acha o .app dentro do disco em vez de assumir o nome', async () => {
    const t = setup()
    await ensureMoonlightMac(t.deps)
    const install = t.scripts.find((s) => s.includes('hdiutil attach')) ?? ''
    expect(install).toMatch(/find "\$mnt" -maxdepth 2 -name '\*\.app'/)
    expect(install).not.toContain('"$mnt/Moonlight.app"')
  })

  it('o nome do executável vem do Info.plist, sem assumir "Moonlight"', async () => {
    const t = setup({ executable: 'Moonlight Game Streaming' })
    const exe = await ensureMoonlightMac(t.deps)
    expect(exe.endsWith('/Contents/MacOS/Moonlight Game Streaming')).toBe(true)
  })

  it('o disco instalado sem o executável avisa em português, em vez de falhar mais tarde', async () => {
    const t = setup({ withBinary: false })
    await expect(ensureMoonlightMac(t.deps)).rejects.toThrow('veio sem o executável')
  })

  it('nome de executável com caminho ou caracteres estranhos é recusado', async () => {
    for (const bad of ['../../bin/sh', 'a/b', '', 'x;rm -rf']) {
      const t = setup({ installed: true, executable: bad })
      await expect(ensureMoonlightMac(t.deps)).rejects.toThrow()
    }
  })

  it('caminhos com espaço e aspas vão protegidos para o sh', async () => {
    const t = setup()
    t.deps.dir = "/Users/o'brien/Library/Application Support/horizonte"
    t.deps.exists = async () => false
    t.deps.run = async (script) => {
      t.scripts.push(script)
      return script.includes('plutil') ? 'Moonlight' : ''
    }
    await ensureMoonlightMac(t.deps).catch(() => undefined)
    const install = t.scripts.find((s) => s.includes('hdiutil attach')) ?? ''
    expect(install).toContain(String.raw`'/Users/o'\''brien/Library/Application Support/horizonte'`)
  })

  it('falha no download: nada é instalado', async () => {
    const t = setup()
    t.deps.download = async () => {
      throw new Error('hash não confere')
    }
    await expect(ensureMoonlightMac(t.deps)).rejects.toThrow('hash não confere')
    expect(t.scripts).toEqual([])
  })
})
