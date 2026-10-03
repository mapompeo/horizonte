import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCredentialVault, type Cipher } from './secrets'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-sec-'))
  file = join(dir, 'credentials.bin')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Cifra de mentira, mas que não deixa o texto legível: inverte os bytes. */
const fakeCipher = (available = true): Cipher => ({
  isAvailable: () => available,
  encrypt: (plain) => Buffer.from(plain, 'utf8').reverse(),
  decrypt: (data) => Buffer.from(data).reverse().toString('utf8')
})

const credentials = { username: 'horizonte', password: 'segredo-123', port: 47989 }

describe('createCredentialVault', () => {
  it('guarda e devolve as credenciais', async () => {
    const vault = createCredentialVault({ file, cipher: fakeCipher() })
    await vault.save(credentials)
    expect(await vault.load()).toEqual(credentials)
  })

  it('a senha nunca fica legível no arquivo', async () => {
    await createCredentialVault({ file, cipher: fakeCipher() }).save(credentials)
    const raw = (await readFile(file)).toString('latin1')
    expect(raw).not.toContain('segredo-123')
  })

  it('sem cofre do sistema recusa guardar, em vez de gravar a senha em texto', async () => {
    const vault = createCredentialVault({ file, cipher: fakeCipher(false) })
    await expect(vault.save(credentials)).rejects.toThrow(/cofre/i)
    expect(await readdir(dir)).toEqual([])
  })

  it('sem arquivo devolve null', async () => {
    expect(await createCredentialVault({ file, cipher: fakeCipher() }).load()).toBeNull()
  })

  it('arquivo corrompido ou de outro usuário devolve null, sem estourar', async () => {
    await writeFile(file, 'lixo')
    const broken: Cipher = {
      ...fakeCipher(),
      decrypt: () => {
        throw new Error('não consegui decifrar')
      }
    }
    expect(await createCredentialVault({ file, cipher: broken }).load()).toBeNull()
  })

  it('conteúdo decifrado com formato errado devolve null', async () => {
    const cipher = fakeCipher()
    await writeFile(file, cipher.encrypt(JSON.stringify({ username: 1 })))
    expect(await createCredentialVault({ file, cipher }).load()).toBeNull()
  })

  it('clear apaga e não reclama se já não existe', async () => {
    const vault = createCredentialVault({ file, cipher: fakeCipher() })
    await vault.save(credentials)
    await vault.clear()
    await vault.clear()
    expect(await vault.load()).toBeNull()
  })

  it('o erro de gravação não vaza a senha', async () => {
    await writeFile(join(dir, 'arquivo'), 'x') // uma pasta não pode ser criada dentro de um arquivo
    const vault = createCredentialVault({
      file: join(dir, 'arquivo', 'x'),
      cipher: fakeCipher()
    })
    const failure = await vault.save(credentials).catch((cause: unknown) => cause)
    expect(String((failure as Error).message)).not.toContain('segredo-123')
  })
})
