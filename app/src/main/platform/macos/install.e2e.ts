import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SunshineApi } from '../../engine/sunshine/api'
import { createMacPlatform, createMoonlightLauncher } from './wire'

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

      // Pareamento por PIN de verdade: o Moonlight pede, a API aprova e o aparelho entra na lista.
      const api = new SunshineApi({
        port: credentials.port,
        username: credentials.username,
        password: credentials.password
      })
      const moonlight = await createMoonlightLauncher(mkdtempSync(join(tmpdir(), 'hz-mac-ml-')))()
      const pin = '4821'
      const name = 'Notebook de teste'
      const child = spawn(moonlight, ['pair', '127.0.0.1', '--pin', pin], {
        stdio: 'inherit',
        detached: true
      })
      const exited = new Promise<number | null>((resolve) => {
        child.once('exit', resolve)
        child.once('error', () => resolve(null))
      })
      let pairingId: string | undefined
      for (let i = 0; i < 60 && !pairingId; i++) {
        pairingId = (await api.listPairings())[0]?.id
        if (!pairingId) await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      expect(pairingId, 'o Sunshine recebeu o pedido de pareamento').toBeTruthy()
      expect(await api.submitPin({ pairingId: pairingId as string, pin, name })).toBe(true)
      const outcome = await Promise.race([
        exited,
        new Promise<'travou'>((resolve) => setTimeout(() => resolve('travou'), 20_000))
      ])
      const names = await api.listClientNames()
      console.log('--- pareamento no Mac: saída do Moonlight =', outcome, '| aparelhos =', names)
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // já tinha encerrado
      }
      expect(names, 'o Sunshine registrou o aparelho').toContain(name)
      // Experimento: com o processo do pair morto, o Moonlight já enxerga este Sunshine como pareado?
      const listed = await new Promise<string>((resolve) => {
        const p = spawn(moonlight, ['list', '127.0.0.1'], { env: process.env, detached: true })
        let out = ''
        p.stdout?.on('data', (d: Buffer) => (out += d.toString()))
        p.stderr?.on('data', (d: Buffer) => (out += d.toString()))
        const t = setTimeout(() => {
          try {
            if (p.pid) process.kill(-p.pid, 'SIGKILL')
          } catch {
            // já tinha encerrado
          }
          resolve('(travou) ' + out)
        }, 30_000)
        p.once('exit', (code) => {
          clearTimeout(t)
          resolve('(código ' + code + ') ' + out)
        })
      })
      console.log('--- moonlight list depois do pair:', listed.slice(0, 600))
    })
  }
)
