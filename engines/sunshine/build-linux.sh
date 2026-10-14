#!/usr/bin/env bash
# Compila o Sunshine do Horizonte: o Sunshine oficial na versão fixada abaixo, mais os patches de patches/.
# Uso: engines/sunshine/build-linux.sh <pasta-de-trabalho> [opções extras do linux_build.sh]
set -euo pipefail

UPSTREAM=https://github.com/LizardByte/Sunshine.git
TAG=v2026.914.233613
COMMIT=63d35f702ee9e362e43263742981836ec0710384

here=$(cd "$(dirname "$0")" && pwd)
work=${1:?informe a pasta de trabalho}
shift

if [ ! -d "$work/Sunshine/.git" ]; then
  git clone --depth 1 --branch "$TAG" "$UPSTREAM" "$work/Sunshine"
  git -C "$work/Sunshine" submodule update --init --recursive --depth 1
fi
cd "$work/Sunshine"
# A tag não pode ter mudado de commit: o pacote só sai do código conferido.
test "$(git rev-parse HEAD)" = "$COMMIT"
git checkout -- .
for patch in "$here"/patches/*.patch; do
  git apply --whitespace=nowarn "$patch"
done

bash scripts/linux_build.sh \
  --skip-cuda \
  --publisher-name=Horizonte \
  --publisher-website=https://github.com/mapompeo/horizonte \
  --publisher-issue-url=https://github.com/mapompeo/horizonte/issues \
  "$@"
