#!/bin/sh
# Compila o auxiliar do modo Mouse do Windows com o gcc do MinGW (já vem na máquina Windows da CI).
set -e
cd "$(dirname "$0")"
mkdir -p build
gcc -O2 -Wall -Wextra -Wno-missing-field-initializers -o build/horizonte-mouse.exe horizonte-mouse.c -luser32
echo "build/horizonte-mouse.exe"
