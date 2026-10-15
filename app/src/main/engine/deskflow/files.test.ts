import { describe, expect, it } from 'vitest'
import {
  createFileClipboard,
  MAX_TOTAL_BYTES,
  type FileClipboardDeps,
  type OfferedFile
} from './files'

function harness(sizes: Record<string, number | null> = {}): {
  deps: FileClipboardDeps
  copy(paths: string[]): Promise<void>
  offers: { to: string; files: OfferedFile[] }[]
  downloads: { from: string; name: string; dest: string }[]
  clipboard: string[][]
} {
  let onChange: ((paths: string[]) => void) | null = null
  const offers: { to: string; files: OfferedFile[] }[] = []
  const downloads: { from: string; name: string; dest: string }[] = []
  const clipboard: string[][] = []
  return {
    offers,
    downloads,
    clipboard,
    copy: async (paths) => {
      onChange?.(paths)
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    deps: {
      watch: (listener) => {
        onChange = listener
        return () => (onChange = null)
      },
      setClipboard: async (paths) => void clipboard.push(paths),
      sizeOf: async (path) => (path in sizes ? (sizes[path] ?? null) : 10),
      baseName: (path) => path.split(/[\\/]/).pop() ?? '',
      newInbox: async () => 'C:/recebidos/1',
      join: (...parts) => parts.join('/'),
      download: async (from, file, dest) => void downloads.push({ from, name: file.name, dest }),
      offer: async (to, files) => void offers.push({ to, files })
    }
  }
}

describe('copiar e colar arquivos entre os PCs', () => {
  it('copiar arquivos aqui oferece ao outro PC, que pode baixar cada um pelo id', async () => {
    const h = harness()
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.6')
    await h.copy(['C:\\docs\\relatorio.pdf', 'C:\\docs\\foto.png'])
    expect(h.offers).toHaveLength(1)
    const [first] = h.offers[0]!.files
    expect(h.offers[0]!.files.map((file) => file.name)).toEqual(['relatorio.pdf', 'foto.png'])
    expect(files.served(first!.id, '192.168.1.6')).toBe('C:\\docs\\relatorio.pdf')
  })

  it('só o outro lado da conversa baixa; um terceiro na rede recebe nada', async () => {
    const h = harness()
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.6')
    await h.copy(['C:\\docs\\relatorio.pdf'])
    const id = h.offers[0]!.files[0]!.id
    expect(files.served(id, '192.168.1.66')).toBeNull()
  })

  it('pastas ficam de fora e o total passa de 2 GB não oferece nada', async () => {
    const h = harness({ 'C:\\pasta': null, 'C:\\grande.iso': MAX_TOTAL_BYTES + 1 })
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.6')
    await h.copy(['C:\\pasta'])
    await h.copy(['C:\\grande.iso'])
    expect(h.offers).toEqual([])
  })

  it('oferta recebida: baixa cada arquivo com nome seguro e põe na área de transferência', async () => {
    const h = harness()
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.4')
    await files.receive([{ id: 'a', name: '../../etc/senha', size: 3 }], '192.168.1.4')
    expect(h.downloads).toEqual([
      { from: '192.168.1.4', name: '../../etc/senha', dest: 'C:/recebidos/1/senha' }
    ])
    expect(h.clipboard).toEqual([['C:/recebidos/1/senha']])
  })

  it('o que chegou do outro PC não volta para ele como oferta nova', async () => {
    const h = harness()
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.4')
    await files.receive([{ id: 'a', name: 'foto.png', size: 3 }], '192.168.1.4')
    await h.copy(['C:/recebidos/1/foto.png'])
    expect(h.offers).toEqual([])
  })

  it('oferta de quem não é o outro lado é ignorada', async () => {
    const h = harness()
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.4')
    await files.receive([{ id: 'a', name: 'x.exe', size: 3 }], '192.168.1.66')
    expect(h.downloads).toEqual([])
  })

  it('parar desliga a observação: copiar depois não oferece nada', async () => {
    const h = harness()
    const files = createFileClipboard(h.deps)
    files.start('192.168.1.6')
    files.stop()
    await h.copy(['C:\\docs\\relatorio.pdf'])
    expect(h.offers).toEqual([])
  })
})
