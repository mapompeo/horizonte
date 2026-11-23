import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync
} from 'node:crypto'
import type { Socket } from 'node:net'

/**
 * Canal cifrado do modo Mouse (há teclas, e até senhas, passando por aqui). Cada lado manda a chave pública X25519 e os
 * dois derivam duas chaves AES-256-GCM, uma por sentido, misturando o `token` combinado no pedido. Quem só escuta a rede
 * não lê nada. Não há certificado: quem conseguir se pôr no meio da rede e ver o token ainda poderia interceptar.
 */

const KEY_BYTES = 32
const TAG_BYTES = 16
const NONCE_BYTES = 12
const HEADER_BYTES = 4
/** Eventos são pequenos; acima disso, o fluxo está errado. */
const MAX_FRAME = 4096
const HANDSHAKE_MS = 5000

export interface SecureLink {
  send(message: unknown): void
  onMessage(listener: (message: unknown) => void): void
  onClose(listener: () => void): void
  close(): void
  readonly closed: boolean
}

function nonce(counter: bigint): Buffer {
  const out = Buffer.alloc(NONCE_BYTES)
  out.writeBigUInt64BE(counter, NONCE_BYTES - 8)
  return out
}

/** Faz a troca de chaves neste socket; rejeita com token errado, tempo esgotado ou conexão fechada. */
export function secureLink(
  socket: Socket,
  token: string,
  role: 'server' | 'client'
): Promise<SecureLink> {
  socket.setNoDelay(true)
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url')
  socket.write(raw)

  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0)
    let sendKey: Buffer | null = null
    let receiveKey: Buffer | null = null
    let sendCounter = 0n
    let receiveCounter = 0n
    let closed = false
    let verified = false
    const messages = new Set<(message: unknown) => void>()
    const closes = new Set<() => void>()

    const timer = setTimeout(
      () => fail(new Error('o outro computador não respondeu a tempo')),
      HANDSHAKE_MS
    )
    function fail(error: Error): void {
      clearTimeout(timer)
      if (!verified) reject(error)
      socket.destroy()
    }

    const send = (message: unknown): void => {
      if (closed || !sendKey || socket.destroyed) return
      const cipher = createCipheriv('aes-256-gcm', sendKey, nonce(sendCounter++))
      const body = Buffer.concat([
        cipher.update(JSON.stringify(message), 'utf8'),
        cipher.final(),
        cipher.getAuthTag()
      ])
      const header = Buffer.alloc(HEADER_BYTES)
      header.writeUInt32BE(body.length)
      socket.write(Buffer.concat([header, body]))
    }

    const link: SecureLink = {
      send,
      onMessage: (listener) => void messages.add(listener),
      onClose: (listener) => void closes.add(listener),
      close: () => socket.destroy(),
      get closed() {
        return closed
      }
    }

    function frame(body: Buffer): void {
      if (!receiveKey || body.length < TAG_BYTES) throw new Error('mensagem curta demais')
      const decipher = createDecipheriv('aes-256-gcm', receiveKey, nonce(receiveCounter++))
      decipher.setAuthTag(body.subarray(body.length - TAG_BYTES))
      const text = Buffer.concat([
        decipher.update(body.subarray(0, body.length - TAG_BYTES)),
        decipher.final()
      ]).toString('utf8')
      const message: unknown = JSON.parse(text)
      if (!verified) {
        // A primeira mensagem prova que o outro lado chegou às mesmas chaves (tem o mesmo token).
        verified = true
        clearTimeout(timer)
        resolve(link)
        return
      }
      for (const listener of [...messages]) listener(message)
    }

    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk])
      try {
        if (!sendKey) {
          if (pending.length < KEY_BYTES) return
          const shared = diffieHellman({
            privateKey,
            publicKey: createPublicKey({
              key: {
                kty: 'OKP',
                crv: 'X25519',
                x: pending.subarray(0, KEY_BYTES).toString('base64url')
              },
              format: 'jwk'
            })
          })
          pending = pending.subarray(KEY_BYTES)
          const derive = (label: string): Buffer =>
            Buffer.from(hkdfSync('sha256', shared, token, `horizonte-mouse ${label}`, KEY_BYTES))
          sendKey = derive(role)
          receiveKey = derive(role === 'server' ? 'client' : 'server')
          send({ t: 'hello' })
        }
        while (pending.length >= HEADER_BYTES) {
          const size = pending.readUInt32BE(0)
          if (size > MAX_FRAME) throw new Error('mensagem grande demais')
          if (pending.length < HEADER_BYTES + size) return
          const body = pending.subarray(HEADER_BYTES, HEADER_BYTES + size)
          pending = pending.subarray(HEADER_BYTES + size)
          frame(body)
        }
      } catch (error) {
        // Chave errada, mensagem adulterada ou fora do formato: a conexão acaba aqui.
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
    socket.on('error', () => undefined)
    socket.on('close', () => {
      closed = true
      clearTimeout(timer)
      if (!verified) reject(new Error('a conexão fechou antes de combinar as chaves'))
      for (const listener of [...closes]) listener()
    })
  })
}
