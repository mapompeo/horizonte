import type { PinnedArtifact } from '../windows/versions'

/**
 * Sunshine 2026.914.233613 para Ubuntu (amd64). O hash é o `digest` que a API do GitHub publica para
 * cada pacote, conferido em 03/10/2026.
 */
const base = 'https://github.com/LizardByte/Sunshine/releases/download/v2026.914.233613'
const deb = (ubuntu: string, sha256: string): PinnedArtifact => {
  const fileName = `sunshine_2026.914.233613-1+ubuntu${ubuntu}_amd64.deb`
  return {
    version: '2026.914.233613',
    fileName,
    url: `${base}/${encodeURIComponent(fileName)}`,
    sha256
  }
}

const SUNSHINE_DEBS: Record<string, PinnedArtifact> = {
  '22.04': deb('22.04', 'c7645396027b0601a09d49de89674b80b3c9ac7a3dffe0d52703738dab072f1c'),
  '24.04': deb('24.04', 'c38e9c705f650f8705f61702717e99bec34044c5028fcb8f23a08fe041292c21'),
  '26.04': deb('26.04', 'b8a8ceeeb2b3f30a18a994ad268c94e0c91170f33a864c7aad31eed927ad7d47')
}

/** Lê `/etc/os-release` e devolve o pacote certo, ou explica por que não há. */
export function sunshineDebFor(osRelease: string, arch: string): PinnedArtifact {
  const field = (name: string): string =>
    new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(osRelease)?.[1] ?? ''
  if (arch !== 'x64') {
    throw new Error('Por enquanto o Horizonte no Linux só instala em processador x64.')
  }
  if (field('ID') !== 'ubuntu') {
    throw new Error('Por enquanto o Horizonte instala o motor de transmissão só no Ubuntu.')
  }
  const found = SUNSHINE_DEBS[field('VERSION_ID')]
  if (!found) {
    throw new Error(
      `O Ubuntu ${field('VERSION_ID')} ainda não tem pacote do motor de transmissão no Horizonte.`
    )
  }
  return found
}

/**
 * Moonlight 6.1.0 (AppImage) para receber a tela. A API do GitHub não publica o hash deste arquivo: o SHA-256
 * foi calculado baixando o arquivo em 07/10/2026 e fica fixo aqui; qualquer outro conteúdo é recusado.
 */
export const MOONLIGHT_LINUX_APPIMAGE: PinnedArtifact = {
  version: '6.1.0',
  fileName: 'Moonlight-6.1.0-x86_64.AppImage',
  url: 'https://github.com/moonlight-stream/moonlight-qt/releases/download/v6.1.0/Moonlight-6.1.0-x86_64.AppImage',
  sha256: '0e855ffd22d407e18ab5fdb575fed5f01ca119a3f91993c5f0213f15ac80b400'
}
