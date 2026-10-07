import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEngineMemory } from './memory'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-mem-'))
  file = join(dir, 'sub', 'engine.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createEngineMemory', () => {
  it('gravações concorrentes preservam a última chamada sem colisão', async () => {
    const memory = createEngineMemory(file)
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, n) => memory.save({ encoder: `encoder-${n}` }))
    )
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    expect(await memory.load()).toEqual({ encoder: 'encoder-19' })
  })
  it('sem arquivo não há lembrança', async () => {
    expect(await createEngineMemory(file).load()).toBeNull()
  })

  it('grava e lê de volta, inclusive o "nenhum encoder de GPU funcionou"', async () => {
    const memory = createEngineMemory(file)
    await memory.save({ encoder: 'gpu-transcoding' })
    expect(await memory.load()).toEqual({ encoder: 'gpu-transcoding' })
    await memory.save({ encoder: null })
    expect(await memory.load()).toEqual({ encoder: null })
  })

  it.each(['{ não é json', '[]', '"texto"', '{"encoder": 5}', '{}'])(
    'conteúdo inválido %s vira "sem lembrança"',
    async (content) => {
      const memory = createEngineMemory(file)
      await memory.save({ encoder: 'x' })
      await writeFile(file, content, 'utf8')
      expect(await memory.load()).toBeNull()
    }
  )
})
