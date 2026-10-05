import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPairedHostsStore } from './paired-hosts'

const folder = (): Promise<string> => mkdtemp(join(tmpdir(), 'horizonte-paired-'))

describe('createPairedHostsStore', () => {
  it('sem arquivo, não há aparelho pareado', async () => {
    const store = createPairedHostsStore(join(await folder(), 'paired.json'))
    expect(await store.load()).toEqual([])
  })

  it('o que foi gravado volta na próxima leitura, criando a pasta se preciso', async () => {
    const file = join(await folder(), 'dentro', 'paired.json')
    await createPairedHostsStore(file).save(['192.168.1.5', '192.168.1.9'])
    expect(await createPairedHostsStore(file).load()).toEqual(['192.168.1.5', '192.168.1.9'])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(['192.168.1.5', '192.168.1.9'])
  })

  it('arquivo corrompido ou com outro formato vira lista vazia, sem erro', async () => {
    const file = join(await folder(), 'paired.json')
    await writeFile(file, '{ não é json', 'utf8')
    expect(await createPairedHostsStore(file).load()).toEqual([])
    await writeFile(file, JSON.stringify({ host: 1 }), 'utf8')
    expect(await createPairedHostsStore(file).load()).toEqual([])
  })

  it('ignora entradas que não são texto', async () => {
    const file = join(await folder(), 'paired.json')
    await writeFile(file, JSON.stringify(['192.168.1.5', 7, null]), 'utf8')
    expect(await createPairedHostsStore(file).load()).toEqual(['192.168.1.5'])
  })
})
