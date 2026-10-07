import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { SunshineApi } from '../../engine/sunshine/api'
import type { SunshineCredentials } from '../types'
import { downloadVerified } from '../windows/download'
import { createCredentialVault, type Cipher } from '../windows/secrets'
import { generatePassword, waitForApi } from '../windows/wire'
import { shQuote } from '../linux/setup'
import { ensureMoonlightMac } from './moonlight'
import { startDisplayHelper, type RunningDisplay } from './helper'
import { createMacSetup, SUNSHINE_PROCESS, type MacProbe } from './setup'
import { MOONLIGHT_MAC_DMG, sunshineDmgFor } from './versions'

const PORT = 47989
const APPS_DIR = join(homedir(), 'Applications')
export const SUNSHINE_LOG = join(homedir(), '.config', 'sunshine', 'sunshine.log')

const sh = (script: string, timeoutMs = 120_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('sh', ['-c', script], { timeout: timeoutMs }, (error, out, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve(out)
    )
  })

const succeeds = (script: string): Promise<boolean> =>
  sh(script, 15_000).then(
    () => true,
    () => false
  )

/** Conta as linhas "Resolution:" do relatório de telas: uma por tela ligada. */
export const countDisplays = (report: string): number => (report.match(/Resolution:/g) ?? []).length

/** O auxiliar sabe contar as telas pela API do sistema; sem ele, o relatório do `system_profiler`. */
export const createProbe = (helperPath: string | null = null): MacProbe => ({
  sunshineInstalled: () => succeeds(`test -d ${shQuote(join(APPS_DIR, 'Sunshine.app'))}`),
  sunshineResponding: () => succeeds('lsof -nP -iTCP:47990 -sTCP:LISTEN'),
  displayCount: async () =>
    helperPath
      ? Number((await sh(`${shQuote(helperPath)} --count`, 15_000)).trim())
      : countDisplays(await sh('system_profiler SPDisplaysDataType', 30_000))
})

/** Devolve o caminho do executável do Moonlight no Mac, baixando e instalando na primeira vez (sem administrador). */
export function createMoonlightLauncher(userData: string): () => Promise<string> {
  return () =>
    ensureMoonlightMac({
      dir: join(userData, 'moonlight'),
      workDir: tmpdir(),
      artifact: MOONLIGHT_MAC_DMG,
      exists: (path) => succeeds(`test -e ${shQuote(path)}`),
      download: downloadVerified,
      run: (script) => sh(script, 600_000)
    })
}

type MacPlatform = ReturnType<typeof createMacSetup> & {
  restart(): Promise<void>
  createApi(credentials: SunshineCredentials): SunshineApi
  credentials(): Promise<SunshineCredentials>
}

export function createMacPlatform(deps: {
  userData: string
  cipher: Cipher
  sleep: (ms: number) => Promise<void>
  /** Caminho do auxiliar horizonte-display, ou null quando ele não existe (código-fonte sem compilar). */
  helperPath: string | null
}): MacPlatform {
  const vault = createCredentialVault({
    file: join(deps.userData, 'sunshine.bin'),
    cipher: deps.cipher
  })
  const createApi = (c: SunshineCredentials): SunshineApi =>
    new SunshineApi({ port: c.port, username: c.username, password: c.password })

  let monitor: RunningDisplay | null = null
  const helperPath =
    deps.helperPath !== null && existsSync(deps.helperPath) ? deps.helperPath : null
  // O auxiliar também encerra sozinho se o app morrer (ele confere o processo pai); isto cobre o fim normal.
  process.on('exit', () => monitor?.stop())

  const setup = createMacSetup({
    probe: createProbe(helperPath),
    vault,
    download: downloadVerified,
    run: async (script) => void (await sh(script, 600_000)),
    dmgForThisMac: () => sunshineDmgFor(process.arch),
    waitForApi: async () => {
      const credentials = await vault.load()
      if (!credentials) throw new Error('A senha do motor de transmissão não foi guardada.')
      await waitForApi(() => createApi(credentials).getConfig(), deps.sleep)
    },
    generatePassword,
    sleep: deps.sleep,
    startVirtualDisplay: helperPath
      ? async () => {
          if (monitor) return
          monitor = await startDisplayHelper(() => {
            const child = spawn(helperPath, [], { stdio: ['ignore', 'pipe', 'pipe'] })
            return {
              onStdout: (cb) =>
                void child.stdout.on('data', (chunk: Buffer) => cb(chunk.toString())),
              onStderr: (cb) =>
                void child.stderr.on('data', (chunk: Buffer) => cb(chunk.toString())),
              onExit: (cb) =>
                void child.on('exit', (code) => {
                  monitor = null
                  cb(code)
                }),
              kill: () => void child.kill('SIGTERM')
            }
          })
        }
      : undefined,
    workDir: tmpdir(),
    appsDir: APPS_DIR,
    port: PORT
  })

  return {
    ...setup,
    restart: async () => {
      await sh(
        `pkill -x ${SUNSHINE_PROCESS} || true\nopen ${shQuote(join(APPS_DIR, 'Sunshine.app'))}`
      )
    },
    createApi,
    credentials: async () => {
      const stored = await vault.load()
      if (!stored)
        throw new Error('O motor de transmissão ainda não foi configurado pelo Horizonte.')
      return stored
    }
  }
}
