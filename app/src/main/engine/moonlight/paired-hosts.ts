import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Guarda em disco quais aparelhos este computador já pareou (um arquivo JSON com a lista de endereços). */
export function createPairedHostsStore(file: string): {
  load(): Promise<string[]>
  save(hosts: string[]): Promise<void>
} {
  let saves: Promise<void> = Promise.resolve()
  return {
    async load() {
      try {
        const data: unknown = JSON.parse(await readFile(file, 'utf8'))
        return Array.isArray(data) ? data.filter((host) => typeof host === 'string') : []
      } catch {
        return []
      }
    },
    async save(hosts) {
      const snapshot = [...hosts]
      const save = saves.then(async () => {
        await mkdir(dirname(file), { recursive: true })
        const temporary = `${file}.${process.pid}.tmp`
        await writeFile(temporary, JSON.stringify(snapshot), 'utf8')
        await rename(temporary, file)
      })
      saves = save.catch(() => undefined)
      await save
    }
  }
}
