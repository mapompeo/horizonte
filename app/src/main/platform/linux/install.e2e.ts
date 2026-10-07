import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SunshineApi } from '../../engine/sunshine/api'
import type { SunshineCredentials } from '../types'
import { downloadVerified } from '../windows/download'
import { generatePassword, waitForApi } from '../windows/wire'
import { createLinuxSetup } from './setup'
import { sunshineDebFor } from './versions'
import { createProbe } from './wire'

const run = (command: string, args: string[], timeoutMs = 600_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, env: process.env }, (error, out, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve(out)
    )
  })

/** Instala de verdade (apt, serviço do usuário): só na CI, onde há sudo sem senha e uma máquina descartável. */
describe.runIf(process.platform === 'linux' && process.env.CI === 'true')(
  'instalação real no Linux (só na CI)',
  () => {
    it('instala o pacote, cria a senha, liga o serviço pelo nome que o Horizonte usa e a API responde', async () => {
      let saved: SunshineCredentials | null = null
      const vault = {
        load: async () => saved,
        save: async (credentials: SunshineCredentials) => {
          saved = credentials
        }
      }
      const setup = createLinuxSetup({
        probe: createProbe(),
        vault,
        download: downloadVerified,
        runPrivileged: async (script) => void (await run('sudo', ['-n', 'sh', '-c', script])),
        runUser: async (script) => void (await run('sh', ['-c', script], 120_000)),
        debForThisSystem: () =>
          sunshineDebFor(readFileSync('/etc/os-release', 'utf8'), process.arch),
        env: process.env,
        waitForApi: async () => {
          const c = saved
          if (!c) throw new Error('sem senha guardada')
          await waitForApi(
            () =>
              new SunshineApi({
                port: c.port,
                username: c.username,
                password: c.password
              }).getConfig(),
            (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            40
          )
        },
        generatePassword,
        workDir: mkdtempSync(join(tmpdir(), 'hz-install-')),
        port: 47989
      })

      // Numa sessão de verdade o gerenciador de serviços do usuário já tem a tela; aqui ele é avisado.
      await run('systemctl', ['--user', 'import-environment', 'DISPLAY', 'XAUTHORITY']).catch(
        () => undefined
      )
      const notes: string[] = []
      try {
        await setup.installer.ensureInstalled((progress) => notes.push(progress.note))
        console.log('etapas:', notes.join(' > '))
        await setup.display.ensureVirtualDisplay()
      } finally {
        for (const [title, command, args] of [
          ['systemctl status', 'systemctl', ['--user', 'status', 'sunshine', '--no-pager', '-l']],
          [
            'journal do serviço',
            'journalctl',
            ['--user', '-n', '60', '--no-pager', '-u', 'app-dev.lizardbyte.app.Sunshine.service']
          ],
          [
            'log do Sunshine',
            'tail',
            ['-n', '40', join(homedir(), '.config/sunshine/sunshine.log')]
          ],
          ['monitores', 'xrandr', ['--listmonitors']],
          ['processos do sunshine', 'sh', ['-c', 'pgrep -a -f sunshine || true']],
          [
            'quem escuta nas portas 4798x/4799x',
            'sh',
            ['-c', 'ss -ltnp | grep -E "4798|4799" || true']
          ],
          [
            'unidades de usuário do sunshine',
            'sh',
            ['-c', 'systemctl --user list-units --all | grep -i sunshine || true']
          ],
          [
            'unidades do sistema do sunshine',
            'sh',
            ['-c', 'systemctl list-units --all | grep -i sunshine || true']
          ],
          [
            'início do journal do serviço',
            'sh',
            [
              '-c',
              'journalctl --user --no-pager -u app-dev.lizardbyte.app.Sunshine.service | grep -E "Started|Stopping|Stopped|Starting|Failed|Main process|Fatal|Sunshine version" | head -30 || true'
            ]
          ]
        ] as const) {
          const text = await run(command, [...args], 30_000).catch(
            (e: Error) => `(falhou: ${e.message})`
          )
          console.log(`--- ${title}\n${text}`)
        }
      }

      const probe = createProbe()
      expect(await probe.sunshineInstalled()).toBe(true)
      expect(await probe.serviceActive()).toBe(true)
      expect(await probe.sunshineResponding()).toBe(true)
      expect(await probe.monitorPresent()).toBe(true)
    })
  }
)
