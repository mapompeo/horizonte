import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SunshineApi } from '../../engine/sunshine/api'
import { createMacPlatform } from './wire'

const HELPER = resolve('native/macos/build/horizonte-display')
const run = (command: string, args: string[]): Promise<string> =>
  new Promise((resolveRun) =>
    execFile(command, args, { timeout: 30_000 }, (error, out, stderr) =>
      resolveRun(error ? `(falhou: ${stderr.trim() || error.message})` : out)
    )
  )

/** Instala de verdade em ~/Applications: só na CI, onde a máquina é descartável. */
describe.runIf(process.platform === 'darwin' && process.env.CI === 'true')(
  'instalação real no Mac (só na CI)',
  () => {
    it('com uma tela só: cria o monitor virtual, instala o Sunshine, guarda a senha e a API responde', async () => {
      expect(existsSync(HELPER), 'o auxiliar foi compilado').toBe(true)
      const platform = createMacPlatform({
        userData: mkdtempSync(join(tmpdir(), 'hz-mac-install-')),
        // Sem o cofre do Electron aqui: o texto vai como está, só dentro desta máquina descartável.
        cipher: {
          isAvailable: () => true,
          encrypt: (plain) => Buffer.from(plain),
          decrypt: (data) => data.toString()
        },
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        helperPath: HELPER
      })

      const notes: string[] = []
      try {
        await platform.installer.ensureInstalled((progress) => notes.push(progress.note))
        console.log('etapas:', [...new Set(notes)].join(' > '))
        await platform.display.ensureVirtualDisplay()
      } finally {
        console.log('--- telas segundo o auxiliar:', (await run(HELPER, ['--count'])).trim())
        console.log(
          '--- processos',
          await run('sh', ['-c', 'pgrep -fl "Sunshine|horizonte-display" || true'])
        )
        const log = join(homedir(), '.config', 'sunshine', 'sunshine.log')
        console.log(
          '--- log do Sunshine\n' +
            (existsSync(log)
              ? readFileSync(log, 'utf8').split('\n').slice(-40).join('\n')
              : '(sem log)')
        )
      }
      // O monitor virtual some com o auxiliar: libera a identidade para o próximo teste.
      const screensWithMonitor = Number((await run(HELPER, ['--count'])).trim())
      platform.stopVirtualDisplay()

      const credentials = await platform.credentials()
      const config = await new SunshineApi({
        port: credentials.port,
        username: credentials.username,
        password: credentials.password
      }).getConfig()
      expect(config).toBeTypeOf('object')
      expect(screensWithMonitor).toBeGreaterThanOrEqual(2)
    })
  }
)
