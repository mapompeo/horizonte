import { app, powerSaveBlocker, screen } from 'electron'
import { appendFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { MotorRole, MotorStats } from '../../shared/motor'
import { percentiles } from '../../shared/percentiles'
import {
  createLinuxVirtualScreen,
  framesSocket,
  gnomeFrames,
  handleCaptureRequests,
  helloFor,
  listenReports,
  motorWindow,
  primarySize,
  windowMedia
} from '../engine/webrtc/electron'
import { SIGNALING_PORT, type Want } from '../engine/webrtc/protocol'
import { connect, startSender } from '../engine/webrtc/session'
import type { MotorArgs } from './args'

export { prepareMotorSwitches } from '../engine/webrtc/electron'

/** Teste de ponta a ponta: tempo máximo até o quadro de teste ser conferido. */
const TEST_TIMEOUT_MS = 60_000

const log = (...parts: unknown[]): void => console.log('[motor]', ...parts)

const lanAddresses = (): string[] =>
  Object.values(networkInterfaces())
    .flat()
    .flatMap((info) => (info && info.family === 'IPv4' && !info.internal ? [info.address] : []))

/** Guarda cada segundo de números num arquivo e resume ao fim. */
function recorder(role: MotorRole): {
  file: string
  add(stats: MotorStats): void
  summary(): string
} {
  const file = join(app.getPath('userData'), 'motor-medidas.jsonl')
  const samples: MotorStats[] = []
  let lastLog = 0
  return {
    file,
    add(stats: MotorStats) {
      samples.push(stats)
      void appendFile(file, JSON.stringify({ role, ...stats }) + '\n').catch(() => undefined)
      if (stats.at - lastLog >= 5000) {
        lastLog = stats.at
        log(
          `${stats.width}x${stats.height} ${stats.fps} fps ${stats.mbps} Mbps ${stats.codec} (${stats.implementation}` +
            `${stats.hardware === null ? '' : stats.hardware ? ', placa de vídeo' : ', software'})` +
            ` ida e volta ${stats.rttMs ?? '?'} ms` +
            (stats.displayMs !== null ? ` recebido até a tela ${stats.displayMs} ms` : '') +
            (stats.latencyMs !== null ? ` captura até a tela ${stats.latencyMs} ms` : '') +
            (stats.qualityLimitation && stats.qualityLimitation !== 'none'
              ? ` limitado por ${stats.qualityLimitation}`
              : '')
        )
      }
    },
    summary(): string {
      const series = (pick: (s: MotorStats) => number | null): string => {
        const p = percentiles(samples.map(pick).filter((v): v is number => v !== null))
        return p
          ? `mediana ${Math.round(p.median * 10) / 10}, p95 ${Math.round(p.p95 * 10) / 10}`
          : '?'
      }
      return [
        `${samples.length} s de sessão`,
        `fps: ${series((s) => s.fps)}`,
        `Mbps: ${series((s) => s.mbps)}`,
        `captura até a tela (ms): ${series((s) => s.latencyMs)}`,
        `recebido até a tela (ms): ${series((s) => s.displayMs)}`,
        `ida e volta (ms): ${series((s) => s.rttMs)}`,
        `descartados: ${samples.at(-1)?.framesDropped ?? 0}, perdidos: ${samples.at(-1)?.packetsLost ?? 0}`,
        `números de cada segundo em ${file}`
      ].join('\n  ')
    }
  }
}

async function runSend(args: Extract<MotorArgs, { role: 'send' }>): Promise<void> {
  if (args.extend && process.platform !== 'linux')
    throw new Error('O modo estender do teste ainda só existe no Linux com GNOME.')
  const frames = args.extend && gnomeFrames() ? framesSocket() : null
  const virtual = args.extend ? createLinuxVirtualScreen(frames) : null
  /** A tela que a janela captura: a do monitor virtual, quando estende; senão a principal. */
  let target: number | null = null
  const wayland = process.platform === 'linux' && Boolean(process.env.WAYLAND_DISPLAY)

  if (wayland && virtual && !frames)
    log('no seletor do GNOME, escolha a tela "MetaVendor" (a tela nova).')
  handleCaptureRequests(() => target)

  const records = recorder('send')
  const window = motorWindow(
    { role: 'send', synthetic: args.synthetic, testFrames: null, showStats: false },
    { show: false, width: 320, height: 200 }
  )
  const reports = listenReports(window.webContents, (report) => {
    if (report.type === 'stats') records.add(report.stats)
  })
  const identity = await reports.identity()

  if (args.clock) {
    const { bounds } = screen.getPrimaryDisplay()
    motorWindow(
      { role: 'clock', synthetic: false, testFrames: null, showStats: false },
      {
        ...bounds,
        fullscreen: true
      }
    )
  }

  const sender = await startSender({
    ...(args.port !== undefined ? { port: args.port } : {}),
    hello: () => helloFor(identity),
    // Teste do motor: aceita qualquer um, e avisa. A aprovação de verdade entra na Fase 3.
    approve: async (peer, address) => {
      log(`${peer.name} (${address}) pediu para ver a tela: aceito sem perguntar (teste do motor).`)
      return true
    },
    media: () =>
      windowMedia(window, {
        beforeStart: async (want) => {
          if (!virtual) return
          target = await virtual.ensure({ width: want.width, height: want.height, fps: want.fps })
          log(`tela estendida criada: ${want.width}x${want.height}`)
          return frames ? { frames } : undefined
        },
        afterStop: () => {
          target = null
          void virtual?.release()
        }
      }),
    onSession(session, address) {
      log(`mostrando a tela para ${session.peer.name} (${address})`)
      session.onEnded((reason) => log(`sessão encerrada: ${reason}\n  ${records.summary()}`))
    },
    onError: (error) => log(error.message)
  })
  const blocker = powerSaveBlocker.start('prevent-app-suspension')
  app.once('before-quit', () => {
    powerSaveBlocker.stop(blocker)
    void sender.stop()
    void virtual?.release()
  })

  const addresses = lanAddresses()
  log(`pronto para enviar. Impressão digital: ${identity.fp.slice(0, 23)}…`)
  log(
    `no outro aparelho: --motor-receive=${addresses[0] ?? 'IP-DESTE-PC'}:${sender.port}` +
      (addresses.length > 1 ? `  (outros endereços: ${addresses.slice(1).join(', ')})` : '')
  )
  log(
    'qualquer aparelho da rede pode ver esta tela enquanto este teste estiver aberto. Feche para parar.'
  )
}

async function runReceive(args: Extract<MotorArgs, { role: 'receive' }>): Promise<void> {
  const testing = args.testFrames !== null
  const records = recorder('receive')
  const display = screen.getPrimaryDisplay()
  const window = motorWindow(
    { role: 'receive', synthetic: false, testFrames: args.testFrames, showStats: true },
    testing
      ? { width: 960, height: 540, show: true }
      : { ...display.bounds, fullscreen: true, frame: false, show: true }
  )

  const began = Date.now()
  let finished = false
  // Só a primeira saída vale: fechar a sessão ao sair dispara o fim de novo.
  const finish = (code: number): void => {
    if (finished) return
    finished = true
    app.exit(code)
  }
  if (testing)
    setTimeout(() => {
      log(`teste: nenhum resultado em ${TEST_TIMEOUT_MS / 1000} s`)
      finish(1)
    }, TEST_TIMEOUT_MS).unref()

  let end: () => void = () => finish(0)
  const reports = listenReports(window.webContents, (report) => {
    if (report.type === 'first-frame') log(`primeiro quadro em ${Date.now() - began} ms`)
    else if (report.type === 'stats') records.add(report.stats)
    else if (report.type === 'test-result') {
      log(`teste: ${report.ok ? 'ok' : 'FALHOU'} (${report.detail})`)
      finish(report.ok ? 0 : 1)
    } else if (report.type === 'quit') end()
  })
  const [identity, codecs] = await Promise.all([reports.identity(), reports.codecs()])

  const size = args.size ?? primarySize()
  const want: Want = { t: 'want', ...size, fps: args.fps, bitrate: args.bitrate, codecs }
  const port = args.port ?? SIGNALING_PORT
  log(
    `conectando a ${args.host}:${port} (${size.width}x${size.height}, ${args.fps} fps, ${args.bitrate} Mbps)`
  )

  const session = await connect({
    host: args.host,
    port,
    hello: helloFor(identity),
    want,
    media: () => windowMedia(window),
    onPending: (peer) => log(`esperando ${peer.name} permitir…`)
  })
  log(`conectado a ${session.peer.name}`)
  const blocker = powerSaveBlocker.start('prevent-display-sleep')
  end = () => session.end()
  session.onEnded((reason) => {
    powerSaveBlocker.stop(blocker)
    log(`sessão encerrada: ${reason}\n  ${records.summary()}`)
    finish(testing ? 1 : 0)
  })
  window.on('closed', () => session.end())
}

/** Abre o teste do motor no lugar do app. */
export async function runMotorBench(args: MotorArgs): Promise<void> {
  await app.whenReady()
  try {
    if (args.role === 'send') await runSend(args)
    else await runReceive(args)
  } catch (error) {
    log(error instanceof Error ? error.message : String(error))
    app.exit(1)
  }
}
