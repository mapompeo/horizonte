import type { Artifact } from './download'

export interface PinnedArtifact extends Artifact {
  version: string
  /** Nome do arquivo ao salvar na pasta temporária. */
  fileName: string
}

/** Sunshine para Windows. O hash é o `digest` que a API do GitHub publica para o asset. */
export const SUNSHINE: PinnedArtifact = {
  version: '2026.914.233613',
  fileName: 'Sunshine-Windows-AMD64-installer.msi',
  url: 'https://github.com/LizardByte/Sunshine/releases/download/v2026.914.233613/Sunshine-Windows-AMD64-installer.msi',
  sha256: '1d7fed8beecd5889dc7ff14cf9f42d6d38f37c3066c13c6c2a5f4e91847e0ccf'
}

/**
 * Virtual Display Driver (MIT), versão 24.10.27: a última que traz o driver x64 num zip só dele.
 * Esta versão não publica hash na API; o hash abaixo foi calculado em 02/10/2026 sobre o arquivo baixado.
 */
export const VIRTUAL_DISPLAY_DRIVER: PinnedArtifact = {
  version: '24.10.27',
  fileName: 'VirtualDisplayDriver-x64.zip',
  url: 'https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/download/24.10.27/VirtualDisplayDriver-x64.zip',
  sha256: 'b7a36f341f2a0ce43cc2afe7894d30dd8fef7b6f60ef9491aab2ef77663a42fd'
}

/**
 * Moonlight 6.1.0 do Horizonte (engines/moonlight), versão portátil: pareia sem avisos e abre sem o texto de início.
 * Compilado pelo CI do projeto e publicado na release motores-hz1; hash publicado pela API do GitHub.
 */
export const MOONLIGHT: PinnedArtifact = {
  version: '6.1.0-hz1',
  fileName: 'MoonlightPortable-horizonte-x64.zip',
  url: 'https://github.com/mapompeo/horizonte/releases/download/motores-hz1/MoonlightPortable-horizonte-x64.zip',
  sha256: '48322a9ebbc0cd7449d474917687b0614524d99299edb7207516f8c1c2d20853'
}

/**
 * Moonlight Web 2.10.0 (GPL-3.0): recebe a tela no navegador via WebRTC. Hash publicado pela API do
 * GitHub, conferido em 03/10/2026.
 */
export const MOONLIGHT_WEB: PinnedArtifact = {
  version: '2.10.0',
  fileName: 'moonlight-web-x86_64-pc-windows-gnu.zip',
  url: 'https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/v2.10.0/moonlight-web-x86_64-pc-windows-gnu.zip',
  sha256: '1dc3019952c610fbd7deb76dc84e3c4c6f26458ebb44823ea1f02ad883a36da9'
}

/** Moonlight Web 2.10.0 para Linux x86_64 (mesmo hash publicado pela API do GitHub, 03/10/2026). */
export const MOONLIGHT_WEB_LINUX: PinnedArtifact = {
  version: '2.10.0',
  fileName: 'moonlight-web-x86_64-unknown-linux-gnu.tar.gz',
  url: 'https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/v2.10.0/moonlight-web-x86_64-unknown-linux-gnu.tar.gz',
  sha256: 'b17fa535676a1c118bc1eb009134644cab98190b36a0776fb1b4a505d569f5eb'
}
