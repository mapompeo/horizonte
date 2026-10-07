#!/usr/bin/env bash
set -euo pipefail

# Só nos runners descartáveis. O mirror Azure travou ao baixar bibliotecas Mesa.
# Usa o fallback oficial da imagem, preservando a verificação de assinaturas do APT.
if [ -f /etc/apt/apt-mirrors.txt ]; then
  printf '%s\n' 'https://archive.ubuntu.com/ubuntu/' | sudo tee /etc/apt/apt-mirrors.txt >/dev/null
fi
printf '%s\n' 'Acquire::Retries "2";' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' |
  sudo tee /etc/apt/apt.conf.d/80-horizonte-rede >/dev/null
