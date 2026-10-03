import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

export type DownloadErrorKind = 'network' | 'hash' | 'cancelled'

export class DownloadError extends Error {
  constructor(
    readonly kind: DownloadErrorKind,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'DownloadError'
  }
}

export interface Artifact {
  url: string
  /** SHA-256 esperado, em hexadecimal (maiúsculas ou minúsculas). */
  sha256: string
}

/**
 * Baixa para `dest` só se o conteúdo bater com o hash fixo. Escreve num arquivo `.part` e só o
 * renomeia depois de conferir: em qualquer falha (rede, corte, hash, cancelamento) nada fica no destino.
 */
export async function downloadVerified(
  artifact: Artifact,
  dest: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const part = `${dest}.part`
  try {
    const response = await fetch(artifact.url, { signal })
    if (!response.ok || response.body === null) {
      throw new DownloadError(
        'network',
        `O servidor recusou o download (código ${response.status}).`
      )
    }
    const total = Number(response.headers.get('content-length')) || 0
    const hash = createHash('sha256')
    let received = 0

    const measure = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk)
        received += chunk.length
        if (total > 0) onProgress?.(Math.min(received / total, 1))
        done(null, chunk)
      }
    })
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream),
      measure,
      createWriteStream(part),
      { signal }
    )

    if (hash.digest('hex') !== artifact.sha256.toLowerCase()) {
      throw new DownloadError(
        'hash',
        'O arquivo baixado não passou na conferência de integridade, então não vou usá-lo.'
      )
    }
    await rename(part, dest)
    onProgress?.(1)
  } catch (cause) {
    await rm(part, { force: true })
    if (cause instanceof DownloadError) throw cause
    if (signal?.aborted) throw new DownloadError('cancelled', 'Download cancelado.', { cause })
    throw new DownloadError(
      'network',
      'Não consegui baixar. Confira a conexão com a internet e tente de novo.',
      { cause }
    )
  }
}
