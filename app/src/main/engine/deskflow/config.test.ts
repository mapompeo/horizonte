import { describe, expect, it } from 'vitest'
import { computerName, deskflowSettings, edgeRanges, linksConfig } from './config'

describe('computerName', () => {
  it('tira acento, espaço e símbolo, que o Deskflow não aceita', () => {
    expect(computerName('Notebook da Ana')).toBe('Notebook-da-Ana')
    expect(computerName('Escritório #2')).toBe('Escritorio-2')
    expect(computerName('***')).toBe('Horizonte')
  })
})

describe('linksConfig', () => {
  it('à direita: sai pela borda direita deste e entra pela esquerda do outro', () => {
    expect(linksConfig('Desktop', [{ name: 'Notebook', side: 'right' }])).toBe(
      'section: links\n\tDesktop:\n\t\tright = Notebook\n\tNotebook:\n\t\tleft = Desktop\nend\n'
    )
  })

  it('acima: sai pela borda de cima e volta por baixo do outro', () => {
    const links = linksConfig('Desktop', [{ name: 'Notebook', side: 'above' }])
    expect(links).toContain('\t\tup = Notebook')
    expect(links).toContain('\t\tdown = Desktop')
  })

  it('com trecho: só aquele pedaço de cada borda se encosta, nos dois sentidos', () => {
    const links = linksConfig('Desktop', [
      { name: 'Trabalho', side: 'left', ranges: { own: [20, 80], peer: [0, 100] } }
    ])
    expect(links).toContain('\t\tleft(20,80) = Trabalho')
    expect(links).toContain('\t\tright = Desktop(20,80)')
  })

  it('vários computadores, inclusive embaixo: cada um na sua borda, e cada um volta para este', () => {
    const links = linksConfig('Desktop', [
      { name: 'Trabalho', side: 'left' },
      { name: 'Notebook', side: 'below' }
    ])
    expect(links).toBe(
      'section: links\n\tDesktop:\n\t\tleft = Trabalho\n\t\tdown = Notebook\n' +
        '\tTrabalho:\n\t\tright = Desktop\n\tNotebook:\n\t\tup = Desktop\nend\n'
    )
  })
})

describe('edgeRanges', () => {
  const desktop = { width: 3840, height: 1080 }
  const notebook = { width: 1366, height: 768 }

  it('sem posição salva, centraliza a tela menor na borda da maior', () => {
    // 768 de 1080 centralizado: começa em 156 (14%) e vai até 924 (86%).
    expect(edgeRanges('left', desktop, notebook)).toEqual({ own: [14, 86], peer: [0, 100] })
  })

  it('o outro mais abaixo, passando da borda: só o pedaço encostado conta dos dois lados', () => {
    // Começa em 70% de 1080 (756) e teria 768: encosta de 756 a 1080, que é 42% do outro.
    expect(edgeRanges('right', desktop, notebook, 0.7)).toEqual({ own: [70, 100], peer: [0, 42] })
  })

  it('o outro mais acima, começando antes da borda', () => {
    expect(edgeRanges('left', desktop, notebook, -0.2)).toEqual({ own: [0, 51], peer: [28, 100] })
  })

  it('arrastado para longe, ainda sobra um pedaço encostado para o mouse passar', () => {
    const { own } = edgeRanges('left', desktop, notebook, 5)
    expect(own[1] - own[0]).toBeGreaterThan(0)
  })

  it('acima usa as larguras', () => {
    expect(edgeRanges('above', notebook, desktop, 0)).toEqual({ own: [0, 100], peer: [0, 36] })
  })
})

describe('deskflowSettings', () => {
  it('servidor: modo 2, os dois computadores conhecidos e o arquivo de ligações com barras normais', () => {
    const ini = deskflowSettings({
      role: 'server',
      name: 'Desktop',
      peerNames: ['Notebook da Ana', 'Trabalho'],
      linksFile: 'C:\\Users\\ana\\links.conf'
    })
    expect(ini).toContain('coreMode=2')
    expect(ini).toContain('externalConfigFile=C:/Users/ana/links.conf')
    expect(ini).toContain('[computer_Desktop]\nname=Desktop')
    expect(ini).toContain('[computer_Notebook-da-Ana]\nname=Notebook-da-Ana')
    expect(ini).toContain('[computer_Trabalho]\nname=Trabalho')
    expect(ini).toContain('enableClipboard=true')
  })

  it('cliente: modo 1 e o endereço do servidor', () => {
    const ini = deskflowSettings({ role: 'client', name: 'Notebook', serverAddress: '192.168.1.4' })
    expect(ini).toContain('coreMode=1')
    expect(ini).toContain('[client]\nremoteHost=192.168.1.4')
    expect(ini).not.toContain('[server]')
  })
})
