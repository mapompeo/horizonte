import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { SunshineApi } from '../../engine/sunshine/api'
import type { SunshineCredentials } from '../types'
import { downloadVerified } from '../windows/download'
import { createCredentialVault, type Cipher } from '../windows/secrets'
import { generatePassword, waitForApi } from '../windows/wire'
import { createLinuxSetup, MONITOR_NAME, SUNSHINE_UNIT, type LinuxProbe } from './setup'
import { sunshineDebFor } from './versions'

const PORT = 47989
export const SUNSHINE_LOG = join(homedir(), '.config', 'sunshine', 'sunshine.log')

/** Roda um roteiro no `sh`; `ok` diz se terminou com código 0 e `fail` leva a mensagem do erro. */
const sh = (command: string, args: string[], timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs }, (error, _out, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve()
    )
  })

const succeeds = (script: string): Promise<boolean> =>
  sh('sh', ['-c', script], 15_000).then(
    () => true,
    () => false
  )

export const createProbe = (): LinuxProbe => ({
  sunshineInstalled: () => succeeds('command -v sunshine'),
  serviceActive: () => succeeds(`systemctl --user is-active --quiet ${SUNSHINE_UNIT}`),
  sunshineResponding: () => succeeds('ss -ltn | grep -q ":47990 "'),
  monitorPresent: () => succeeds(`xrandr --listmonitors | grep -q ${MONITOR_NAME}`)
})

type LinuxPlatform = ReturnType<typeof createLinuxSetup> & {
  restart(): Promise<void>
  createApi(credentials: SunshineCredentials): SunshineApi
  credentials(): Promise<SunshineCredentials>
}

export function createLinuxPlatform(deps: {
  userData: string
  cipher: Cipher
  sleep: (ms: number) => Promise<void>
}): LinuxPlatform {
  const vault = createCredentialVault({
    file: join(deps.userData, 'sunshine.bin'),
    cipher: deps.cipher
  })
  const createApi = (c: SunshineCredentials): SunshineApi =>
    new SunshineApi({ port: c.port, username: c.username, password: c.password })

  const setup = createLinuxSetup({
    probe: createProbe(),
    vault,
    download: downloadVerified,
    // O pkexec mostra o aviso de senha do sistema (polkit) uma única vez.
    runPrivileged: (script) => sh('pkexec', ['sh', '-c', script], 600_000),
    runUser: (script) => sh('sh', ['-c', script], 120_000),
    // Lido só na hora de instalar: o arquivo existe apenas no Linux.
    debForThisSystem: () => sunshineDebFor(readFileSync('/etc/os-release', 'utf8'), process.arch),
    env: process.env,
    waitForApi: async () => {
      const credentials = await vault.load()
      if (!credentials) throw new Error('A senha do motor de transmissão não foi guardada.')
      await waitForApi(() => createApi(credentials).getConfig(), deps.sleep)
    },
    generatePassword,
    workDir: tmpdir(),
    port: PORT
  })

  return {
    ...setup,
    restart: () => sh('systemctl', ['--user', 'restart', SUNSHINE_UNIT], 90_000),
    createApi,
    credentials: async () => {
      const stored = await vault.load()
      if (!stored)
        throw new Error('O motor de transmissão ainda não foi configurado pelo Horizonte.')
      return stored
    }
  }
}
