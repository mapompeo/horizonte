import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SunshineCredentials } from '../types'

/** O mesmo formato do `safeStorage` do Electron (DPAPI no Windows), para poder trocá-lo por um falso nos testes. */
export interface Cipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export interface CredentialVault {
  save(credentials: SunshineCredentials): Promise<void>
  /** Devolve null se não há nada guardado ou se o arquivo não serve mais (outro usuário, corrompido). */
  load(): Promise<SunshineCredentials | null>
  clear(): Promise<void>
}

const isCredentials = (value: unknown): value is SunshineCredentials => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['username'] === 'string' &&
    typeof v['password'] === 'string' &&
    typeof v['port'] === 'number'
  )
}

export function createCredentialVault(deps: { file: string; cipher: Cipher }): CredentialVault {
  return {
    async save(credentials) {
      // Sem cofre do sistema a alternativa seria texto puro: melhor recusar.
      if (!deps.cipher.isAvailable()) {
        throw new Error('O cofre de senhas do sistema não está disponível para guardar a senha.')
      }
      const data = deps.cipher.encrypt(JSON.stringify(credentials))
      const temp = `${deps.file}.tmp`
      try {
        await mkdir(dirname(deps.file), { recursive: true })
        await writeFile(temp, data)
        await rename(temp, deps.file)
      } catch {
        await rm(temp, { force: true })
        throw new Error('Não consegui gravar a senha do Sunshine no cofre.')
      }
    },

    async load() {
      try {
        const raw = await readFile(deps.file)
        const parsed: unknown = JSON.parse(deps.cipher.decrypt(raw))
        return isCredentials(parsed) ? parsed : null
      } catch {
        return null
      }
    },

    async clear() {
      await rm(deps.file, { force: true })
    }
  }
}
