import { describe, expect, it } from 'vitest'
import { computerName, deskflowSettings, linksConfig } from './config'

describe('computerName', () => {
  it('tira acento, espaço e símbolo, que o Deskflow não aceita', () => {
    expect(computerName('Notebook da Ana')).toBe('Notebook-da-Ana')
    expect(computerName('Escritório #2')).toBe('Escritorio-2')
    expect(computerName('***')).toBe('Horizonte')
  })
})

describe('linksConfig', () => {
  it('à direita: sai pela borda direita deste e entra pela esquerda do outro', () => {
    expect(linksConfig('Desktop', 'Notebook', 'right')).toBe(
      'section: links\n\tDesktop:\n\t\tright = Notebook\n\tNotebook:\n\t\tleft = Desktop\nend\n'
    )
  })

  it('acima: sai pela borda de cima e volta por baixo do outro', () => {
    const links = linksConfig('Desktop', 'Notebook', 'above')
    expect(links).toContain('\t\tup = Notebook')
    expect(links).toContain('\t\tdown = Desktop')
  })
})

describe('deskflowSettings', () => {
  it('servidor: modo 2, os dois computadores conhecidos e o arquivo de ligações com barras normais', () => {
    const ini = deskflowSettings({
      role: 'server',
      name: 'Desktop',
      peerName: 'Notebook da Ana',
      linksFile: 'C:\\Users\\ana\\links.conf'
    })
    expect(ini).toContain('coreMode=2')
    expect(ini).toContain('externalConfigFile=C:/Users/ana/links.conf')
    expect(ini).toContain('[computer_Desktop]\nname=Desktop')
    expect(ini).toContain('[computer_Notebook-da-Ana]\nname=Notebook-da-Ana')
    expect(ini).toContain('enableClipboard=true')
  })

  it('cliente: modo 1 e o endereço do servidor', () => {
    const ini = deskflowSettings({ role: 'client', name: 'Notebook', serverAddress: '192.168.1.4' })
    expect(ini).toContain('coreMode=1')
    expect(ini).toContain('[client]\nremoteHost=192.168.1.4')
    expect(ini).not.toContain('[server]')
  })
})
