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
 * Moonlight Qt 6.1.0, versão portátil (zip, sem instalador nem administrador). A API não publica hash;
 * este foi calculado em 03/10/2026 sobre o arquivo baixado.
 */
export const MOONLIGHT: PinnedArtifact = {
  version: '6.1.0',
  fileName: 'MoonlightPortable-x64-6.1.0.zip',
  url: 'https://github.com/moonlight-stream/moonlight-qt/releases/download/v6.1.0/MoonlightPortable-x64-6.1.0.zip',
  sha256: '95f4d0853a31c7fced4b6d233ddf55ee41720963f2e2620a9cb49a21d112aed1'
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
