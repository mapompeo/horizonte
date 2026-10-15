import { randomUUID } from 'node:crypto'

/** Até onde vale copiar e colar entre os PCs: arquivos soltos (pastas ainda não), somando no máximo 2 GB. */
export const MAX_TOTAL_BYTES = 2 * 1024 ** 3

export interface OfferedFile {
  id: string
  name: string
  size: number
}

export interface FileClipboardDeps {
  /** Avisa sempre que a lista de arquivos copiados muda (lista vazia: nada copiado); devolve como parar. */
  watch(onChange: (paths: string[]) => void): () => void
  /** Põe estes arquivos na área de transferência, prontos para colar. */
  setClipboard(paths: string[]): Promise<void>
  /** Tamanho do arquivo, ou null se não for um arquivo comum (pasta, atalho quebrado). */
  sizeOf(path: string): Promise<number | null>
  baseName(path: string): string
  /** Pasta nova para os arquivos que chegam do outro PC. */
  newInbox(): Promise<string>
  join(...parts: string[]): string
  /** Baixa um arquivo oferecido pelo outro PC, conferindo o tamanho. */
  download(from: string, file: OfferedFile, dest: string): Promise<void>
  /** Manda a oferta ao outro PC. */
  offer(to: string, files: OfferedFile[]): Promise<void>
}

/**
 * Copiar num PC e colar no outro. Ao copiar arquivos aqui, oferece ao outro PC; ao receber uma oferta, baixa e
 * deixa pronto para colar. Os arquivos que este lado pôs na área de transferência não voltam como oferta nova.
 */
export function createFileClipboard(deps: FileClipboardDeps): {
  start(peerAddress: string): void
  stop(): void
  /** Caminho de um arquivo oferecido, só para o PC que recebeu a oferta. */
  served(id: string, from: string): string | null
  /** Oferta que chegou do outro PC. */
  receive(files: OfferedFile[], from: string): Promise<void>
} {
  let peer: string | null = null
  let unwatch: (() => void) | null = null
  let offered = new Map<string, string>()
  let placedByUs = ''

  async function onCopied(paths: string[]): Promise<void> {
    const key = paths.join('\n')
    if (!peer || paths.length === 0 || key === placedByUs) return
    const files: OfferedFile[] = []
    const next = new Map<string, string>()
    let total = 0
    for (const path of paths) {
      const size = await deps.sizeOf(path)
      if (size === null) continue
      total += size
      if (total > MAX_TOTAL_BYTES) return
      const id = randomUUID()
      next.set(id, path)
      files.push({ id, name: deps.baseName(path), size })
    }
    if (files.length === 0) return
    offered = next
    await deps.offer(peer, files).catch(() => undefined)
  }

  return {
    start(peerAddress) {
      peer = peerAddress
      unwatch?.()
      unwatch = deps.watch((paths) => void onCopied(paths))
    },
    stop() {
      peer = null
      unwatch?.()
      unwatch = null
      offered = new Map()
    },
    served(id, from) {
      return from === peer ? (offered.get(id) ?? null) : null
    },
    async receive(files, from) {
      if (from !== peer || files.length === 0) return
      const inbox = await deps.newInbox()
      const paths: string[] = []
      for (const file of files) {
        // O nome vem da rede: sem pastas nem caminho, só o nome do arquivo.
        const safe =
          [...deps.baseName(file.name)]
            .map((char) => (char < ' ' || '<>:"/\\|?*'.includes(char) ? '_' : char))
            .join('') || 'arquivo'
        const dest = deps.join(inbox, safe)
        await deps.download(from, file, dest)
        paths.push(dest)
      }
      placedByUs = paths.join('\n')
      await deps.setClipboard(paths)
    }
  }
}
