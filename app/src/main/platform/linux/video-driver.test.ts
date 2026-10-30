import { describe, expect, it } from 'vitest'
import { parseOsRelease, videoDriverHint, type VideoDriverFacts } from './video-driver'

const ubuntu = { id: 'ubuntu', like: ['debian'] }
const facts = (over: Partial<VideoDriverFacts>): VideoDriverFacts => ({
  vendors: ['0x8086'],
  drivers: ['radeonsi_drv_video.so', 'nouveau_drv_video.so'],
  os: ubuntu,
  ...over
})

describe('aviso de driver de vídeo', () => {
  it('Intel sem o driver no Ubuntu: avisa e dá o comando', () => {
    expect(videoDriverHint(facts({}))).toEqual({
      message:
        'Falta o driver de vídeo da placa Intel. Sem ele, a imagem pode atrasar mais de 1 segundo. Instale o pacote intel-media-va-driver e abra o Horizonte de novo.',
      command: 'sudo apt install -y intel-media-va-driver'
    })
  })

  it('Intel com o driver novo ou o antigo: não avisa', () => {
    expect(videoDriverHint(facts({ drivers: ['iHD_drv_video.so'] }))).toBeNull()
    expect(videoDriverHint(facts({ drivers: ['i965_drv_video.so'] }))).toBeNull()
  })

  it('AMD sem o radeonsi no Fedora: comando do dnf', () => {
    expect(
      videoDriverHint(facts({ vendors: ['0x1002'], drivers: [], os: { id: 'fedora', like: [] } }))
        ?.command
    ).toBe('sudo dnf install -y mesa-va-drivers')
  })

  it('AMD com o radeonsi: não avisa', () => {
    expect(videoDriverHint(facts({ vendors: ['0x1002\n'] }))).toBeNull()
  })

  it('Arch e derivados: pacman', () => {
    expect(
      videoDriverHint(facts({ drivers: [], os: { id: 'endeavouros', like: ['arch'] } }))?.command
    ).toBe('sudo pacman -S --needed intel-media-driver')
  })

  it('distribuição desconhecida: avisa sem comando', () => {
    const hint = videoDriverHint(facts({ drivers: [], os: { id: 'gentoo', like: [] } }))
    expect(hint?.command).toBeNull()
    expect(hint?.message).toMatch(/placa Intel/)
  })

  it('NVIDIA ou máquina virtual: não avisa', () => {
    expect(videoDriverHint(facts({ vendors: ['0x10de'], drivers: [] }))).toBeNull()
    expect(videoDriverHint(facts({ vendors: ['0x1af4'], drivers: [] }))).toBeNull()
  })

  it('placa Intel ao lado de outra: vale a Intel', () => {
    expect(videoDriverHint(facts({ vendors: ['0x10de', '0x8086'], drivers: [] }))).not.toBeNull()
  })
})

describe('parseOsRelease', () => {
  it('lê ID e ID_LIKE, com ou sem aspas', () => {
    expect(parseOsRelease('NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n')).toEqual(ubuntu)
    expect(parseOsRelease('ID="opensuse-tumbleweed"\nID_LIKE="opensuse suse"\n')).toEqual({
      id: 'opensuse-tumbleweed',
      like: ['opensuse', 'suse']
    })
  })
})
