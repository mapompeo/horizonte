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
  it('PIN expirado nao pode ser usado pelo IP', async () => {
    let time = 0
    channel = createPinChannel({ port: 0, now: () => time })
    await channel.start()
    await post(channel.port(), JSON.stringify({ device: 'Notebook', pin: '1234' }))
    time = 3 * 60_000
    expect(channel.takeByAddress?.('127.0.0.1')).toBeUndefined()
  })
  it('associa o PIN ao IP real do cliente, mesmo quando o Moonlight usa roth', async () => {
    channel = createPinChannel({ port: 0 })
    await channel.start()
    await post(channel.port(), JSON.stringify({ device: 'Notebook', pin: '1234' }))
    expect(channel.takeByAddress?.('192.168.1.99')).toBeUndefined()
    expect(channel.takeByAddress?.('::ffff:127.0.0.1')).toEqual({ device: 'Notebook', pin: '1234' })
    expect(channel.take('Notebook')).toBeUndefined()
  })

  it('nao escolhe um PIN se dois dispositivos no mesmo IP estiverem aguardando', async () => {
    channel = createPinChannel({ port: 0 })
    await channel.start()
    await post(channel.port(), JSON.stringify({ device: 'Notebook', pin: '1234' }))
    await post(channel.port(), JSON.stringify({ device: 'Tablet', pin: '5678' }))
    expect(channel.takeByAddress?.('127.0.0.1')).toBeUndefined()
    expect(channel.take('Notebook')).toBe('1234')
  })
  it('duas aberturas simultâneas compartilham a mesma porta', async () => {
    channel = createPinChannel({ port: 0 })
    const first = channel.start()
    const second = channel.start()
    await Promise.all([first, second])
    expect(second).toBe(first)
    expect(await post(channel.port(), JSON.stringify({ device: 'Notebook', pin: '1234' }))).toBe(
      204
    )
  })
  it('stop durante a abertura não deixa a porta escutando depois', async () => {
    channel = createPinChannel({ port: 0 })
    const opening = channel.start()
    await channel.stop()
    await opening
    expect(channel.port()).toBe(0)
  })

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
