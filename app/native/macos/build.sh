#!/bin/sh
# Compila o auxiliar do monitor virtual para os dois chips (Apple e Intel) e junta num arquivo só.
# Só roda no macOS (precisa do Xcode ou das Command Line Tools).
set -e
cd "$(dirname "$0")"
mkdir -p build
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos11.0" -import-objc-header CGVirtualDisplay.h \
    -framework Cocoa -framework CoreGraphics main.swift -o "build/horizonte-display-$arch"
done
lipo -create -output build/horizonte-display build/horizonte-display-arm64 build/horizonte-display-x86_64
codesign --force --sign - build/horizonte-display
lipo -info build/horizonte-display
# O auxiliar do modo Mouse (captura e injeção de mouse e teclado).
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos11.0" -framework ApplicationServices mouse/main.swift \
    -o "build/horizonte-mouse-$arch"
done
lipo -create -output build/horizonte-mouse build/horizonte-mouse-arm64 build/horizonte-mouse-x86_64
codesign --force --sign - build/horizonte-mouse
