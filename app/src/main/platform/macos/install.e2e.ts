import { execFile, spawn, type ChildProcess } from 'node:child_process'
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
      let child: ChildProcess | undefined
      let pairingTimer: ReturnType<typeof setTimeout> | undefined
      try {
        await platform.installer.ensureInstalled((progress) => notes.push(progress.note))
        console.log('etapas:', [...new Set(notes)].join(' > '))
        await platform.display.ensureVirtualDisplay()
        const screensWithMonitor = Number((await run(HELPER, ['--count'])).trim())
        expect(screensWithMonitor).toBeGreaterThanOrEqual(2)
        const credentials = await platform.credentials()
        const api = new SunshineApi({ ...credentials, timeoutMs: 3000 })
        expect(await api.getConfig()).toBeTypeOf('object')

        // Mantém a tela viva durante o pareamento, como o aplicativo durante Enviar.
        const moonlight = await createMoonlightLauncher(mkdtempSync(join(tmpdir(), 'hz-mac-ml-')))()
        const pin = '4821'
        const name = 'Notebook de teste'
        child = spawn(moonlight, ['pair', '127.0.0.1', '--pin', pin], {
          stdio: 'inherit',
          detached: true
        })
        const exited = new Promise<number | null>((resolveExit) => {
          child!.once('exit', resolveExit)
          child!.once('error', () => resolveExit(null))
        })
        let pairingId: string | undefined
        const deadline = Date.now() + 60_000
        while (!pairingId && Date.now() < deadline) {
          pairingId = (await api.listPairings())[0]?.id
          if (!pairingId) await new Promise((resolveWait) => setTimeout(resolveWait, 1000))
        }
        expect(pairingId, 'o Sunshine recebeu o pedido de pareamento').toBeTruthy()
        expect(await api.submitPin({ pairingId: pairingId as string, pin, name })).toBe(true)
        const outcome = await Promise.race([
          exited,
          new Promise<'travou'>((resolveWait) => {
            pairingTimer = setTimeout(() => resolveWait('travou'), 20_000)
          })
        ])
        clearTimeout(pairingTimer)
        const names = await api.listClientNames()
        console.log('--- pareamento no Mac: saída do Moonlight =', outcome, '| aparelhos =', names)
        expect(names, 'o Sunshine registrou o aparelho').toContain(name)
      } finally {
        clearTimeout(pairingTimer)
        // Só o grupo do processo criado por este teste; também limpa quando uma chamada da API falha.
        if (child?.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            // O grupo já encerrou.
          }
        }
        platform.stopVirtualDisplay()
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
    })
  }
)
