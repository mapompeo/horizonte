import type { SunshineDisplay } from '../engine/sunshine/log'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from './types'

const DEFAULT_PORT = 47989
const DEFAULT_LOG = 'C:\\Program Files\\Sunshine\\config\\sunshine.log'

/** Modo de desenvolvimento: o Sunshine já está instalado e rodando; a API dirá se não estiver. */
export function existingInstaller(): EngineInstaller {
  return { ensureInstalled: async () => undefined }
}

/** Modo de desenvolvimento: o monitor virtual já existe; só sabemos reconhecê-lo pelo nome. */
export function existingDisplay(): VirtualDisplay {
  return {
    ensureVirtualDisplay: async () => undefined,
    isVirtual: (display: SunshineDisplay) => /vdd|virtual/i.test(display.friendlyName)
  }
}

export interface DevEngineConfig {
  credentials: SunshineCredentials
  logPath: string
}

/** Lê as variáveis de ambiente do modo de desenvolvimento. Devolve null se não for o motor "sunshine". */
export function readDevEngineConfig(env: NodeJS.ProcessEnv): DevEngineConfig | null {
  if (env['HORIZONTE_ENGINE'] !== 'sunshine') return null

  const username = env['HORIZONTE_SUNSHINE_USER']
  const password = env['HORIZONTE_SUNSHINE_PASSWORD']
  if (!username || !password) {
    throw new Error(
      'Defina HORIZONTE_SUNSHINE_USER e HORIZONTE_SUNSHINE_PASSWORD para usar o Sunshine de verdade.'
    )
  }

  const rawPort = env['HORIZONTE_SUNSHINE_PORT']
  const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_000) {
    throw new Error('HORIZONTE_SUNSHINE_PORT precisa ser um número de porta válido.')
  }

  return {
    credentials: { username, password, port },
    logPath: env['HORIZONTE_SUNSHINE_LOG'] || DEFAULT_LOG
  }
}
