import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, createSettingsStore, parseSettings } from './settings'

describe('parseSettings', () => {
  it('lembra o último modo; sem modo válido, é a primeira vez (null)', () => {
    expect(parseSettings({ mode: 'send' }).mode).toBe('send')
    expect(parseSettings({ mode: 'receive' }).mode).toBe('receive')
    for (const mode of [undefined, null, '', 'both', 1, {}]) {
      expect(parseSettings({ mode }).mode).toBeNull()
    }
  })

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
      deviceName: 'Notebook',
      extendSide: 'left',
      mouseSides: { Trabalho: 'left' },
      mouseOffsets: { Trabalho: 0.25 },
      trusted: [{ name: 'Desktop', address: '192.168.1.4' }],
      screenPlacements: { ['AB:'.repeat(31) + 'CD']: { side: 'below', offset: 0.5 } }
    }
    expect(parseSettings(raw)).toEqual({ ...raw, profile: 'custom', mode: null })
  })

  it('lado de cada computador no modo Mouse: só lados válidos, no máximo 20', () => {
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`PC${i}`, 'left']))
    expect(Object.keys(parseSettings({ mouseSides: many }).mouseSides)).toHaveLength(20)
    expect(
      parseSettings({ mouseSides: { Trabalho: 'left', Outro: 'embaixo', '': 'right' } }).mouseSides
    ).toEqual({ Trabalho: 'left' })
    expect(parseSettings({ mouseSides: ['left'] }).mouseSides).toEqual({})
  })

  it('aparelhos confiáveis: nome limpo e endereço válido, no máximo 20; o resto some', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      name: `A${i}`,
      address: `10.0.0.${i + 1}`
    }))
    expect(parseSettings({ trusted: many }).trusted).toHaveLength(20)
    expect(
      parseSettings({
        trusted: [
          { name: 'Desktop', address: '192.168.1.4' },
          { name: 'Sem endereço' },
          { name: '', address: '192.168.1.5' },
          { name: 'Ruim', address: 'http://x' },
          'texto'
        ]
      }).trusted
    ).toEqual([{ name: 'Desktop', address: '192.168.1.4' }])
  })

  it('posição da tela estendida: só esquerda, direita ou acima; padrão à direita', () => {
    expect(parseSettings({ extendSide: 'above' }).extendSide).toBe('above')
    expect(parseSettings({ extendSide: 'below' }).extendSide).toBe('right')
    expect(parseSettings({}).extendSide).toBe('right')
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

describe('nome padrão do dispositivo', () => {
  it('usa o nome do próprio aparelho enquanto a pessoa não escolheu outro', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'horizonte-name-'))
    try {
      const store = createSettingsStore(join(dir, 'settings.json'), 'Tablet da Ana')
      expect((await store.load()).deviceName).toBe('Tablet da Ana')
      await store.save({ ...(await store.load()), deviceName: 'Sala' })
      expect((await store.load()).deviceName).toBe('Sala')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('o nome padrão antigo "Computador", já gravado em disco, vira o nome do aparelho', () => {
    expect(parseSettings({ deviceName: 'Computador' }, 'Notebook da Ana').deviceName).toBe(
      'Notebook da Ana'
    )
    expect(parseSettings({ deviceName: 'Sala' }, 'Notebook da Ana').deviceName).toBe('Sala')
  })

  it('sem nome nenhum cai em "Dispositivo", nunca em "Computador"', () => {
    expect(parseSettings({}).deviceName).toBe('Dispositivo')
  })

  it('guarda a posição da tela por aparelho, só com impressão digital, lado e início válidos', () => {
    const FP = 'AB:'.repeat(31) + 'CD'
    expect(
      parseSettings({
        screenPlacements: {
          [FP]: { side: 'left', offset: 0.25 },
          ['EF:'.repeat(31) + '01']: { side: 'below' },
          ['01:'.repeat(31) + '02']: { side: 'above', offset: 99 },
          Notebook: { side: 'right' },
          ['02:'.repeat(31) + '03']: { side: 'dentro' }
        }
      }).screenPlacements
    ).toEqual({
      [FP]: { side: 'left', offset: 0.25 },
      ['EF:'.repeat(31) + '01']: { side: 'below' },
      ['01:'.repeat(31) + '02']: { side: 'above' }
    })
  })

  it('aparelho confiável guarda o tamanho da tela, quando válido', () => {
    expect(
      parseSettings({
        trusted: [
          { name: 'Notebook', address: '192.168.1.9', screen: { width: 1366, height: 768 } },
          { name: 'Tablet', address: '192.168.1.8', screen: { width: -1, height: 'x' } }
        ]
      }).trusted
    ).toEqual([
      { name: 'Notebook', address: '192.168.1.9', screen: { width: 1366, height: 768 } },
      { name: 'Tablet', address: '192.168.1.8' }
    ])
  })
})
