import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ensureMoonlight } from './install'

const dir = join('C:', 'dados', 'moonlight')
const exe = join(dir, 'Moonlight.exe')

describe('ensureMoonlight', () => {
  it('já instalado: não baixa nada', async () => {
    const download = vi.fn()
    const path = await ensureMoonlight({ dir, exists: async () => true, download, extract: vi.fn() })
    expect(path).toBe(exe)
    expect(download).not.toHaveBeenCalled()
  })

  it('baixa, extrai e devolve o caminho', async () => {
    const present = new Set<string>()
    const extract = vi.fn(async () => void present.add(exe))
    const path = await ensureMoonlight({
      dir,
      exists: async (p) => present.has(p),
      download: async () => 'moonlight.zip',
      extract
    })
    expect(path).toBe(exe)
    expect(extract).toHaveBeenCalledWith('moonlight.zip', dir)
  })

  it('pacote sem o executável é erro, não sucesso', async () => {
    await expect(
      ensureMoonlight({
        dir,
        exists: async () => false,
        download: async () => 'x.zip',
        extract: async () => undefined
      })
    ).rejects.toThrow(/Moonlight\.exe/)
  })
})
