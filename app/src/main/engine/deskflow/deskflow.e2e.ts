import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadVerified } from '../../platform/windows/download'
import { psQuote } from '../../platform/windows/elevation'
import { runPowerShell } from '../../platform/windows/probes'
import { DESKFLOW_PORT } from './config'
import { createMouseShare, type MouseShareDeps } from './session'
import { DESKFLOW_WINDOWS } from './versions'

/** Espera a porta do servidor aceitar conexão (o Deskflow leva um instante para subir). */
async function waitForPort(port: number, ms: number): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
    if (open) return
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`a porta ${port} não abriu em ${ms} ms`)
}

/** Só no Windows: baixa o Deskflow portátil de verdade e liga servidor e cliente na mesma máquina. */
describe.runIf(process.platform === 'win32')('Deskflow de verdade', () => {
  it('servidor e cliente do Horizonte se conectam pela porta 24800', async () => {
    const work = mkdtempSync(join(tmpdir(), 'hz-deskflow-'))
    const zip = join(work, DESKFLOW_WINDOWS.fileName)
    await downloadVerified(DESKFLOW_WINDOWS, zip)
    await runPowerShell(
      `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(join(work, 'app'))} -Force`,
      120_000
    )
    const folder = readdirSync(join(work, 'app'))[0] ?? ''
    const exe = join(work, 'app', folder, 'deskflow-core.exe')

    const deps = (dir: string): MouseShareDeps => ({
      command: async () => ({ command: exe, prefix: [] }),
      dir,
      writeFile: (path, text) => writeFile(path, text),
      join,
      spawn: async (command, args) => {
        const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
        return { kill: () => void child.kill(), onExit: (l) => void child.once('exit', l) }
      }
    })
    const server = createMouseShare(deps(mkdtempSync(join(work, 'srv-'))))
    const client = createMouseShare(deps(mkdtempSync(join(work, 'cli-'))))
    try {
      await server.share({ name: 'Desktop', peerName: 'Notebook', side: 'right' })
      await waitForPort(DESKFLOW_PORT, 20_000)
      await client.follow({ name: 'Notebook', serverAddress: '127.0.0.1' })
      // O cliente com nome conhecido fica conectado; um nome desconhecido seria derrubado pelo servidor.
      await new Promise((resolve) => setTimeout(resolve, 4000))
      const established = await runPowerShell(
        `(Get-NetTCPConnection -LocalPort ${DESKFLOW_PORT} -State Established -ErrorAction SilentlyContinue | Measure-Object).Count`
      )
      expect(Number(established.trim())).toBeGreaterThan(0)
    } finally {
      client.stop()
      server.stop()
    }
  })
})
