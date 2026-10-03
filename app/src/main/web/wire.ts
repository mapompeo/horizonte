import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadVerified } from '../platform/windows/download'
import { psQuote } from '../platform/windows/elevation'
import { runPowerShell } from '../platform/windows/probes'
import { createCredentialVault, type Cipher } from '../platform/windows/secrets'
import { generatePassword } from '../platform/windows/wire'
import { MOONLIGHT_WEB } from '../platform/windows/versions'
import { createGateway, type Gateway } from './gateway'

/** Primeiro endereço de rede local (privado) que não seja de máquina virtual. */
export function lanAddress(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string | undefined {
  const candidates = Object.values(interfaces)
    .flat()
    .flatMap((i) => (i && i.family === 'IPv4' && !i.internal ? [i.address] : []))
    .filter(
      (a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) && !a.startsWith('192.168.56.')
    )
  return candidates[0]
}

const unavailable: Gateway = {
  status: () => ({ on: false }),
  stop: async () => undefined,
  start: async () => ({
    on: false,
    error: 'Receber pelo navegador ainda não está disponível neste sistema.'
  })
}

export function createRealGateway(deps: {
  userData: string
  cipher: Cipher
  sleep: (ms: number) => Promise<void>
  deviceName: () => string
}): Gateway {
  if (process.platform !== 'win32') return unavailable
  const dir = join(deps.userData, 'web')
  const packageDir = join(dir, 'package')

  return createGateway({
    dir,
    deviceName: deps.deviceName,
    sleep: deps.sleep,
    generateCode: () => generatePassword().slice(0, 8),
    lanAddress: () => lanAddress(),
    vault: createCredentialVault({ file: join(deps.userData, 'web.bin'), cipher: deps.cipher }),
    ensureFiles: async () => {
      if (!existsSync(join(packageDir, 'web-server.exe'))) {
        const zip = join(tmpdir(), MOONLIGHT_WEB.fileName)
        await downloadVerified(MOONLIGHT_WEB, zip)
        await mkdir(dir, { recursive: true })
        await runPowerShell(
          `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(dir)} -Force`,
          120_000
        )
      }
      return packageDir
    },
    defaultConfig: (pkg) =>
      new Promise((resolve, reject) => {
        execFile(join(pkg, 'web-server.exe'), ['print-config'], { cwd: pkg }, (error, out) =>
          error ? reject(error) : resolve(JSON.parse(out) as Record<string, unknown>)
        )
      }),
    writeConfig: async (path, config) => {
      await mkdir(dir, { recursive: true })
      await writeFile(path, JSON.stringify(config, null, 2), 'utf8')
    },
    spawn: (pkg, configPath) => {
      const child = spawn(join(pkg, 'web-server.exe'), ['--config-path', configPath], {
        cwd: pkg,
        stdio: 'ignore',
        windowsHide: true
      })
      return { kill: () => void child.kill(), onExit: (l) => void child.once('exit', l) }
    },
    post: async (url, body) =>
      (
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      ).status,
    ping: async (url) => {
      await fetch(url, { signal: AbortSignal.timeout(1500) })
    }
  })
}
