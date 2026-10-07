import type { PinnedArtifact } from '../windows/versions'

/** Sunshine 2026.914.233613 para macOS. O hash é o `digest` publicado pela API do GitHub (03/10/2026). */
const base = 'https://github.com/LizardByte/Sunshine/releases/download/v2026.914.233613'

const SUNSHINE_DMG: Record<string, PinnedArtifact> = {
  arm64: {
    version: '2026.914.233613',
    fileName: 'Sunshine-macOS-arm64.dmg',
    url: `${base}/Sunshine-macOS-arm64.dmg`,
    sha256: '795f03a389c5726f9a7b15f501dc1ddf204b442cae565859ac83aae027a9e07c'
  },
  x64: {
    version: '2026.914.233613',
    fileName: 'Sunshine-macOS-x86_64.dmg',
    url: `${base}/Sunshine-macOS-x86_64.dmg`,
    sha256: '764b11674babac0cd838c2883359207a481c462f355ccbfd1ec91f6d44672101'
  }
}

/**
 * Moonlight 6.1.0 para macOS (receber a tela). A API do GitHub não publica o hash deste arquivo: o SHA-256 foi
 * calculado baixando o disco em 06/10/2026 e fica fixo aqui; qualquer outro conteúdo é recusado.
 */
export const MOONLIGHT_MAC_DMG: PinnedArtifact = {
  version: '6.1.0',
  fileName: 'Moonlight-6.1.0.dmg',
  url: 'https://github.com/moonlight-stream/moonlight-qt/releases/download/v6.1.0/Moonlight-6.1.0.dmg',
  sha256: 'd494740eead8ad4e620cdc8feedb56083bc29cabbbeef34cb82585fd87725fa2'
}

export function sunshineDmgFor(arch: string): PinnedArtifact {
  const found = SUNSHINE_DMG[arch]
  if (!found)
    throw new Error('Este tipo de processador ainda não é compatível com o Horizonte no Mac.')
  return found
}
