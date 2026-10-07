import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface EngineMemoryValue {
  /** Id do candidato de GPU que funcionou, ou null se nenhum funcionou. */
  encoder: string | null
}

export interface EngineMemory {
  load(): Promise<EngineMemoryValue | null>
  save(value: EngineMemoryValue): Promise<void>
}

/** Lembra o resultado da sondagem para não reiniciar o Sunshine a cada abertura do app. */
export function createEngineMemory(file: string): EngineMemory {
  let writes: Promise<void> = Promise.resolve()
  return {
    async load() {
      try {
        const data: unknown = JSON.parse(await readFile(file, 'utf8'))
        if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
        const encoder = (data as Record<string, unknown>).encoder
        if (encoder === null || typeof encoder === 'string') return { encoder }
        return null
      } catch {
        return null
      }
    },
    save(value) {
      const data = JSON.stringify(value)
      const write = writes.then(async () => {
        await mkdir(dirname(file), { recursive: true })
        const temporary = `${file}.${process.pid}.tmp`
        try {
          await writeFile(temporary, data, 'utf8')
          await rename(temporary, file)
        } catch (cause) {
          await rm(temporary, { force: true })
          throw cause
        }
      })
      writes = write.catch(() => undefined)
      return write
    }
  }
}
