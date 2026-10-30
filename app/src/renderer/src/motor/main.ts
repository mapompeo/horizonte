import './motor.css'
import { videoMimes } from './codecs'
import { loadIdentity } from './identity'
import { createReceiver } from './receiver'
import { createSender } from './sender'

const api = window.motor

/** Relógio grande em milissegundos: fotografar ele e a tela que mostra lado a lado dá o atraso de ponta a ponta. */
function runClock(): void {
  const clock = document.createElement('div')
  clock.className = 'motor-clock'
  document.body.append(clock)
  const tick = (): void => {
    const now = new Date()
    const pad = (n: number, size = 2): string => String(n).padStart(size, '0')
    clock.textContent = `${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
    requestAnimationFrame(tick)
  }
  tick()
}

async function boot(): Promise<void> {
  const config = await api.config()
  document.body.dataset.role = config.role
  if (config.role === 'clock') return runClock()

  const identity = await loadIdentity()
  api.report({ type: 'identity', id: identity.id, fp: identity.fp })

  const side =
    config.role === 'send'
      ? createSender(api, identity, config.synthetic)
      : createReceiver(api, identity, config)

  api.onMessage((message) => {
    const run = async (): Promise<void> => {
      if (message.t === 'start') await side.start(message.want)
      else if (message.t === 'stop') side.stop()
      else await side.deliver(message)
    }
    run().catch((error: unknown) =>
      api.report({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    )
  })

  if (config.role === 'receive')
    api.report({
      type: 'ready',
      codecs: videoMimes(RTCRtpReceiver.getCapabilities('video')?.codecs ?? [])
    })
}

boot().catch((error: unknown) =>
  api.report({ type: 'error', message: error instanceof Error ? error.message : String(error) })
)
