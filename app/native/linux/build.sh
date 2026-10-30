#!/bin/sh
# Compila o auxiliar do monitor virtual do Linux (GNOME). Precisa de libpipewire-0.3-dev e libglib2.0-dev.
# Sem pkg-config, aceita os caminhos em HZ_CFLAGS e HZ_LIBS.
set -e
cd "$(dirname "$0")"
mkdir -p build
if [ -n "$HZ_CFLAGS" ]; then
  flags="$HZ_CFLAGS $HZ_LIBS"
else
  flags="$(pkg-config --cflags --libs libpipewire-0.3 gio-2.0 gio-unix-2.0)"
fi
# shellcheck disable=SC2086
cc -O2 -pthread -Wall -Wextra -Wno-missing-field-initializers -o build/horizonte-display horizonte-display.c $flags
echo "build/horizonte-display"
