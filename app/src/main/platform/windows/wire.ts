import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SunshineApi } from '../../engine/sunshine/api'
import type { SunshineCredentials } from '../types'
import { downloadVerified } from './download'
import { createElevation, runWithUac } from './elevation'
import { createProbe, runPowerShell } from './probes'
import { createCredentialVault, type Cipher } from './secrets'
import { createWindowsSetup } from './setup'

const SUNSHINE_DIR = 'C:\\Program Files\\Sunshine'
const PORT = 47989
export const SUNSHINE_LOG = join(SUNSHINE_DIR, 'config', 'sunshine.log')

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export const generatePassword = (): string =>
  Array.from(randomBytes(32), (byte) => ALPHABET[byte % ALPHABET.length]).join('')

/** O Sunshine leva alguns segundos para subir depois do reinício do serviço. */
export async function waitForApi(
  ping: () => Promise<unknown>,
  sleep: (ms: number) => Promise<void>,
  attempts = 40
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await ping()
      return
    } catch {
      await sleep(1500)
    }
  }
  throw new Error('O Sunshine não respondeu depois de instalado. Tente de novo em instantes.')
}

/** O `safeStorage` do Electron tem outros nomes de método; este adaptador o encaixa no cofre. */
export const toCipher = (storage: {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(data: Buffer): string
}): Cipher => ({
  isAvailable: () => storage.isEncryptionAvailable(),
  encrypt: (plain) => storage.encryptString(plain),
  decrypt: (data) => storage.decryptString(data)
})

type WindowsPlatform = ReturnType<typeof createWindowsSetup> & {
  createApi(credentials: SunshineCredentials): SunshineApi
  credentials(): Promise<SunshineCredentials>
}

export function createWindowsPlatform(deps: {
  userData: string
  cipher: Cipher
  sleep: (ms: number) => Promise<void>
  onProgress?: (fraction: number) => void
}): WindowsPlatform {
  const vault = createCredentialVault({
    file: join(deps.userData, 'sunshine.bin'),
    cipher: deps.cipher
  })
  const createApi = (c: SunshineCredentials): SunshineApi =>
    new SunshineApi({ port: c.port, username: c.username, password: c.password })

  const setup = createWindowsSetup({
    probe: createProbe(runPowerShell),
    vault,
    download: downloadVerified,
    elevation: createElevation({ run: runWithUac, tmpDir: tmpdir() }),
    waitForApi: async () => {
      const credentials = await vault.load()
      if (!credentials) throw new Error('A senha do Sunshine não foi guardada.')
      await waitForApi(() => createApi(credentials).getConfig(), deps.sleep)
    },
    generatePassword,
    workDir: tmpdir(),
    sunshineDir: SUNSHINE_DIR,
    port: PORT,
    onProgress: deps.onProgress
  })

  return {
    ...setup,
    createApi,
    credentials: async (): Promise<SunshineCredentials> => {
      const stored = await vault.load()
      if (!stored) throw new Error('O Sunshine ainda não foi configurado pelo Horizonte.')
      return stored
    }
  }
}
