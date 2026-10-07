import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Snapshot } from '../../shared/types'
import { buildDiagnostic, type DiagnosticEnv } from './diagnostic'

const MAX_ENTRIES = 10
const MAX_TEXT = 8192
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
interface Entry {
  at: number
  text: string
}

/** Histórico local limitado; texto redigido antes de chegar ao disco, sem upload automático. */
export function createDiagnosticHistory(
  file: string,
  env: DiagnosticEnv,
  now = Date.now
): {
  record(snapshot: Snapshot): Promise<void>
  text(): Promise<string>
} {
  let writes: Promise<void> = Promise.resolve()
  const read = async (): Promise<Entry[]> => {
    try {
      const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
      if (!Array.isArray(raw)) return []
      const cutoff = now() - RETENTION_MS
      return raw
        .filter(
          (item): item is Entry =>
            typeof item === 'object' &&
            item !== null &&
            Number.isFinite(item.at) &&
            item.at >= cutoff &&
            item.at <= now() &&
            typeof item.text === 'string' &&
            item.text.length <= MAX_TEXT
        )
        .slice(-MAX_ENTRIES)
    } catch {
      return []
    }
  }
  return {
    record(snapshot) {
      if (snapshot.state.screen !== 'error') return Promise.resolve()
      const entry = { at: now(), text: buildDiagnostic(env, snapshot).slice(0, MAX_TEXT) }
      const write = writes.then(async () => {
        const entries = [...(await read()), entry].slice(-MAX_ENTRIES)
        await mkdir(dirname(file), { recursive: true })
        const temporary = `${file}.${process.pid}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(entries), { encoding: 'utf8', mode: 0o600 })
          await rename(temporary, file)
        } catch (cause) {
          await rm(temporary, { force: true })
          throw cause
        }
      })
      writes = write.catch(() => undefined)
      return write
    },
    async text() {
      await writes
      return (await read())
        .map((entry) => `${new Date(entry.at).toISOString()}\n${entry.text}`)
        .join('\n\n')
    }
  }
}
