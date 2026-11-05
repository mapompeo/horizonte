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
# O auxiliar do modo Mouse precisa também da libei-dev (GNOME 46 ou mais novo); sem ela, o modo Mouse usa o Deskflow.
if [ -n "$HZ_MOUSE_CFLAGS" ]; then
  mouse="$HZ_MOUSE_CFLAGS $HZ_MOUSE_LIBS"
elif pkg-config --exists libei-1.0 2>/dev/null; then
  mouse="$(pkg-config --cflags --libs libei-1.0 gio-2.0 gio-unix-2.0)"
else
  echo "sem a libei-dev: build/horizonte-mouse não foi compilado" >&2
  exit 0
fi
# shellcheck disable=SC2086
cc -O2 -Wall -Wextra -o build/horizonte-mouse horizonte-mouse.c $mouse
echo "build/horizonte-mouse"
