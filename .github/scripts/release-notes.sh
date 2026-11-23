#!/usr/bin/env bash
# Notas da versão: "Qual baixar?" com o link direto de cada sistema no topo, a novidade embaixo.
# Uso: release-notes.sh <tag> <repo> <novidade>
set -euo pipefail
tag="$1"; repo="$2"; news="$3"
names=$(gh release view "$tag" --repo "$repo" --json assets -q '.assets[].name')
base="https://github.com/$repo/releases/download/$tag"
pick() { grep -E "$1" <<<"$names" | head -1 || true; }
row() {
  local file
  file=$(pick "$2")
  [ -n "$file" ] && echo "| $1 | [$file]($base/$file) |"
  return 0
}
{
  echo "## Qual baixar?"
  echo
  echo "| Seu computador | Arquivo |"
  echo "|---|---|"
  row "Windows 10 e 11" '-setup\.exe$'
  row "Mac com chip Apple (M1 ou mais novo)" 'arm64\.dmg$'
  row "Mac com chip Intel" 'x64\.dmg$'
  row "Linux: Ubuntu, Debian, Mint" '\.deb$'
  row "Linux: qualquer outro" '\.AppImage$'
  echo
  echo "No Linux com o .deb, na pasta do download: \`sudo apt install ./horizonte_*.deb\`"
  echo
  echo "Celular, tablet ou outro navegador: não precisa baixar nada, é só apontar a câmera para o QR code do app."
  echo
  echo "Os arquivos \`.yml\` e \`.blockmap\` são da atualização automática: não precisa baixar."
  echo
  echo "## Novidade"
  echo
  echo "$news"
}
