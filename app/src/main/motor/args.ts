import { isIP } from 'node:net'

/** Como o Horizonte foi aberto para testar o motor novo (Fase 1), sem a interface do app. */
export type MotorArgs =
  | {
      role: 'send'
      port?: number
      synthetic: boolean
      clock: boolean
    }
  | {
      role: 'receive'
      host: string
      port?: number
      fps: number
      bitrate: number
      size?: { width: number; height: number }
      testFrames: number | null
    }

export const MOTOR_USAGE = [
  'Teste do motor novo (sem a interface do app):',
  '  --motor-send                   envia a tela principal',
  '      [--motor-clock]            abre um relógio em milissegundos (medição de atraso por foto)',
  '      [--motor-synthetic]        envia um quadro de teste no lugar da tela',
  '      [--motor-port=47910]',
  '  --motor-receive=IP[:PORTA]     mostra a tela de outro aparelho',
  '      [--motor-fps=60] [--motor-bitrate=30] [--motor-size=1920x1080]',
  '      [--motor-test-frames=120]  confere o quadro de teste e sai (0 = ok)'
].join('\n')

function flag(argv: string[], name: string): string | true | undefined {
  for (const arg of argv) {
    if (arg === `--${name}`) return true
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3)
  }
  return undefined
}

function int(
  value: string | true | undefined,
  name: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (value === true || !Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${name} precisa ser um número entre ${min} e ${max}.`)
  return n
}

/** Lê os argumentos do teste do motor. Sem `--motor-send` nem `--motor-receive`, devolve null (abre o app). */
export function parseMotorArgs(argv: string[]): MotorArgs | null {
  const send = flag(argv, 'motor-send')
  const receive = flag(argv, 'motor-receive')
  if (send === undefined && receive === undefined) return null
  if (send !== undefined && receive !== undefined)
    throw new Error('Use --motor-send ou --motor-receive, não os dois.')

  const port = int(flag(argv, 'motor-port'), 'motor-port', 1, 65535)
  if (send !== undefined)
    return {
      role: 'send',
      ...(port !== undefined ? { port } : {}),
      synthetic: flag(argv, 'motor-synthetic') !== undefined,
      clock: flag(argv, 'motor-clock') !== undefined
    }

  if (typeof receive !== 'string')
    throw new Error('--motor-receive precisa do endereço: --motor-receive=192.168.1.3')
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(receive)
  const host = match?.[1].replace(/^\[|\]$/g, '') ?? ''
  if (!match || (!isIP(host) && !/^[a-z0-9.-]+$/i.test(host)))
    throw new Error(`Endereço inválido: ${receive}`)
  const hostPort = int(match[2], 'motor-receive', 1, 65535) ?? port

  const sizeArg = flag(argv, 'motor-size')
  let size: { width: number; height: number } | undefined
  if (sizeArg !== undefined) {
    const m = typeof sizeArg === 'string' ? /^(\d{3,5})x(\d{3,5})$/.exec(sizeArg) : null
    if (!m) throw new Error('--motor-size precisa ser LARGURAxALTURA, como 1920x1080.')
    size = { width: Number(m[1]), height: Number(m[2]) }
  }

  return {
    role: 'receive',
    host,
    ...(hostPort !== undefined ? { port: hostPort } : {}),
    fps: int(flag(argv, 'motor-fps'), 'motor-fps', 1, 240) ?? 60,
    bitrate: int(flag(argv, 'motor-bitrate'), 'motor-bitrate', 1, 500) ?? 30,
    ...(size ? { size } : {}),
    testFrames: int(flag(argv, 'motor-test-frames'), 'motor-test-frames', 1, 100_000) ?? null
  }
}
