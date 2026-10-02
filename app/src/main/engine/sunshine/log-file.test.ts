import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readLogTail } from './log-file'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-log-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readLogTail', () => {
  it('arquivo ausente devolve texto vazio', async () => {
    expect(await readLogTail(join(dir, 'nao-existe.log'))).toBe('')
  })

  it('arquivo pequeno vem inteiro', async () => {
    const file = join(dir, 'a.log')
    await writeFile(file, 'linha 1\nlinha 2\n', 'utf8')
    expect(await readLogTail(file)).toBe('linha 1\nlinha 2\n')
  })

  it('arquivo grande vem só pelo final', async () => {
    const file = join(dir, 'b.log')
    await writeFile(file, 'x'.repeat(5000) + 'FINAL', 'utf8')
    const tail = await readLogTail(file, 1000)
    expect(tail.length).toBeLessThanOrEqual(1000)
    expect(tail.endsWith('FINAL')).toBe(true)
  })

  it('um caractere cortado no começo da cauda não derruba a leitura', async () => {
    const file = join(dir, 'c.log')
    await writeFile(file, 'á'.repeat(2000), 'utf8')
    await expect(readLogTail(file, 1001)).resolves.toEqual(expect.any(String))
  })

  it('um caminho que é pasta devolve texto vazio', async () => {
    expect(await readLogTail(dir)).toBe('')
  })
})
