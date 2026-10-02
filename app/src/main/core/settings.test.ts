import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, createSettingsStore, parseSettings } from './settings'

describe('parseSettings', () => {
  it('devolve os padrões para entradas que não são objeto', () => {
    for (const raw of [null, undefined, 'texto', 42, true, []]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('aceita um objeto completo e válido', () => {
    const raw = {
      bitrate: 50,
      resolution: '1440p',
      fps: 120,
      encoding: 'gpu',
      codec: 'hevc',
      autostart: false,
      deviceName: 'Notebook'
    }
    expect(parseSettings(raw)).toEqual({ ...raw, profile: 'custom' })
  })

  it('corrige valores inválidos campo a campo', () => {
    const result = parseSettings({
      bitrate: 999,
      resolution: '4k',
      fps: 59,
      encoding: 'quantum',
      codec: 'vp9',
      autostart: 'sim',
      deviceName: '   '
    })
    expect(result).toEqual({ ...DEFAULT_SETTINGS, bitrate: 80, profile: 'custom' })
  })

  it('o perfil sempre acompanha o bitrate', () => {
    expect(parseSettings({ bitrate: 10, profile: 'maximo' }).profile).toBe('economico')
  })

  it('descarta campos desconhecidos', () => {
    const result = parseSettings({ senha: 'x', bitrate: 30 }) as unknown as Record<string, unknown>
    expect('senha' in result).toBe(false)
  })

  it('o nome do computador não guarda quebras de linha, controles nem direção invertida', () => {
    const rtl = String.fromCharCode(0x202e)
    expect(parseSettings({ deviceName: 'Sala\nchave = valor' }).deviceName).toBe(
      'Salachave = valor'
    )
    expect(parseSettings({ deviceName: `No${rtl}te` }).deviceName).toBe('Note')
    expect(parseSettings({ deviceName: '\r\n\t' }).deviceName).toBe(DEFAULT_SETTINGS.deviceName)
  })

  it('limita o nome do computador a 40 caracteres', () => {
    expect(parseSettings({ deviceName: 'a'.repeat(100) }).deviceName).toHaveLength(40)
  })
})

describe('createSettingsStore', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'horizonte-'))
    file = join(dir, 'nested', 'settings.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('arquivo ausente devolve os padrões', async () => {
    expect(await createSettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('arquivo corrompido devolve os padrões', async () => {
    const store = createSettingsStore(file)
    await store.save(DEFAULT_SETTINGS)
    await writeFile(file, '{ isto não é json', 'utf8')
    expect(await store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('arquivo parcial completa com padrões', async () => {
    const store = createSettingsStore(file)
    await store.save(DEFAULT_SETTINGS)
    await writeFile(file, JSON.stringify({ fps: 30 }), 'utf8')
    expect(await store.load()).toEqual({ ...DEFAULT_SETTINGS, fps: 30 })
  })

  it('gravações simultâneas não se atropelam e a última vence', async () => {
    const store = createSettingsStore(file)
    const saves = Array.from({ length: 25 }, (_value, index) =>
      store.save(parseSettings({ bitrate: 10 + index }))
    )
    await Promise.all(saves)
    expect((await store.load()).bitrate).toBe(34)
    expect((await readdir(join(dir, 'nested'))).sort()).toEqual(['settings.json'])
  })

  it('uma gravação que falha não trava as seguintes', async () => {
    const blocked = join(dir, 'arquivo-no-lugar-da-pasta')
    await writeFile(blocked, 'x', 'utf8')
    const broken = createSettingsStore(join(blocked, 'settings.json'))
    await expect(broken.save(DEFAULT_SETTINGS)).rejects.toThrow()
    await expect(broken.save(DEFAULT_SETTINGS)).rejects.toThrow()
    const store = createSettingsStore(file)
    await store.save(parseSettings({ bitrate: 12 }))
    expect((await store.load()).bitrate).toBe(12)
  })

  it('grava e lê de volta, criando as pastas', async () => {
    const store = createSettingsStore(file)
    const custom = parseSettings({ bitrate: 45, deviceName: 'Sala' })
    await store.save(custom)
    expect(await store.load()).toEqual(custom)
    expect(JSON.parse(await readFile(file, 'utf8')).deviceName).toBe('Sala')
  })
})
