import { open } from 'node:fs/promises'

/** Lê no máximo `maxBytes` do final do arquivo. Arquivo ausente ou ilegível vira texto vazio. */
export async function readLogTail(path: string, maxBytes = 2_000_000): Promise<string> {
  let handle
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } catch {
    return ''
  } finally {
    await handle?.close()
  }
}
