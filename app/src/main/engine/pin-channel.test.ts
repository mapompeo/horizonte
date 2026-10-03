import { afterEach, describe, expect, it } from 'vitest'
import { createPinChannel, type PinChannel } from './pin-channel'

let channel: (PinChannel & { port(): number }) | null = null
afterEach(async () => {
  await channel?.stop()
  channel = null
})

async function post(port: number, body: string, path = '/pin'): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body })
  return r.status
}

describe('createPinChannel', () => {
  it('guarda o PIN do dispositivo e entrega uma vez só', async () => {
    channel = createPinChannel({ port: 0 })
    await channel.start()
    expect(await post(channel.port(), JSON.stringify({ device: 'Notebook', pin: '1234' }))).toBe(
      204
    )

    expect(channel.take('notebook')).toBe('1234')
    expect(channel.take('Notebook')).toBeUndefined()
  })

  it('recusa PIN inválido, JSON ruim e outros caminhos', async () => {
    channel = createPinChannel({ port: 0 })
    await channel.start()
    const port = channel.port()
    expect(await post(port, JSON.stringify({ device: 'X', pin: '12a4' }))).toBe(400)
    expect(await post(port, 'não é json')).toBe(400)
    expect(await post(port, '{}', '/outro')).toBe(404)
    expect(channel.take('X')).toBeUndefined()
  })

  it('PIN velho expira', async () => {
    let t = 0
    channel = createPinChannel({ port: 0, now: () => t })
    await channel.start()
    await post(channel.port(), JSON.stringify({ device: 'Notebook', pin: '1234' }))
    t = 3 * 60_000
    expect(channel.take('Notebook')).toBeUndefined()
  })

  it('parado, não aceita mais pedidos', async () => {
    channel = createPinChannel({ port: 0 })
    await channel.start()
    const port = channel.port()
    await channel.stop()
    await expect(post(port, '{}')).rejects.toThrow()
  })
})
