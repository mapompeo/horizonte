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
import {
  MOONLIGHT_WEB,
  MOONLIGHT_WEB_LINUX,
  type PinnedArtifact
} from '../platform/windows/versions'
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

/** Por sistema: o pacote fixado, o nome do executável e como extrair. */
const TARGETS: Partial<
  Record<
    string,
    {
      artifact: PinnedArtifact
      exe: string
      extract: (file: string, into: string) => Promise<void>
    }
  >
> = {
  win32: {
    artifact: MOONLIGHT_WEB,
    exe: 'web-server.exe',
    extract: async (zip, into) => {
      await runPowerShell(
        `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(into)} -Force`,
        120_000
      )
    }
  },
  linux: {
    artifact: MOONLIGHT_WEB_LINUX,
    exe: 'web-server',
    extract: (tgz, into) =>
      new Promise((resolve, reject) => {
        execFile('tar', ['-xzf', tgz, '-C', into], (error) => (error ? reject(error) : resolve()))
      })
  }
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
  const target = TARGETS[process.platform]
  if (!target || process.arch !== 'x64') return unavailable
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
      if (!existsSync(join(packageDir, target.exe))) {
        const file = join(tmpdir(), target.artifact.fileName)
        await downloadVerified(target.artifact, file)
        await mkdir(dir, { recursive: true })
        await target.extract(file, dir)
      }
      return packageDir
    },
    defaultConfig: (pkg) =>
      new Promise((resolve, reject) => {
        execFile(
          join(pkg, target.exe),
          ['print-config'],
          { cwd: pkg, timeout: 15_000 },
          (error, out) => {
            if (error) return reject(error)
            try {
              resolve(JSON.parse(out) as Record<string, unknown>)
            } catch (cause) {
              reject(cause)
            }
          }
        )
      }),
    writeConfig: async (path, config) => {
      await mkdir(dir, { recursive: true })
      await writeFile(path, JSON.stringify(config, null, 2), 'utf8')
    },
    spawn: (pkg, configPath) => {
      const child = spawn(join(pkg, target.exe), ['--config-path', configPath], {
        cwd: pkg,
        stdio: 'ignore',
        windowsHide: true
      })
      child.on('error', () => undefined) // waitUp converte falha de inicialização em erro de acesso
      return { kill: () => void child.kill(), onExit: (l) => void child.once('exit', l) }
    },
    post: async (url, body) =>
      (
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000)
        })
      ).status,
    ping: async (url) => {
      await fetch(url, { signal: AbortSignal.timeout(1500) })
    }
  })
}
