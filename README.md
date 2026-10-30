# Horizonte

**Estenda sua tela. Sem fio.**

O notebook do seu lado vira a segunda tela do computador, sem configurar nada. Gratuito e de código aberto.

![Horizonte](site/og.png)

**Site:** https://mapompeo.github.io/horizonte/

## Baixar

A versão mais recente fica em [Releases](https://github.com/mapompeo/horizonte/releases).

| Sistema | Arquivo | Estado |
|---|---|---|
| Windows 10 e 11 | `Horizonte-<versão>-setup.exe` | Disponível |
| Linux (Ubuntu, Debian 13, Fedora, openSUSE, Arch e derivados; Xorg ou Wayland) | `.AppImage` ou `.deb` | Envia e recebe; em Wayland espelha a tela principal (sem monitor extra); em teste |
| macOS (chip Apple e Intel) | `.dmg` | Envia (com monitor virtual próprio) e recebe; em teste |

O instalador ainda não é assinado. No Windows aparece "O Windows protegeu o computador": clique em Mais informações e depois em Executar assim mesmo.

No Mac, o primeiro "Abrir" pode ser recusado ("danificado" ou "desenvolvedor não identificado"). Arraste o Horizonte para Aplicativos e rode uma vez no Terminal: `xattr -cr /Applications/Horizonte.app`. Depois abra normalmente. Para enviar a tela, o macOS pede a permissão de Gravação de Tela na primeira vez.

## Como funciona

1. Instale nos dois computadores.
2. Em um, escolha Enviar. No outro, Mostrar.
3. Clique em Estender.

Tudo fica na sua rede local, sem conta e sem nuvem.

No Linux, o Horizonte transmite sozinho: WebRTC entre os dois aparelhos, sem instalar nada além dele. No GNOME, a tela estendida é um monitor virtual de verdade, criado sem nenhum diálogo. Use a placa de vídeo nos dois lados; em Intel, instale o `intel-media-va-driver`.

No Windows e no Mac, por enquanto, o Horizonte ainda instala e configura o [Sunshine](https://github.com/LizardByte/Sunshine), o [Moonlight](https://github.com/moonlight-stream/moonlight-qt) e o [Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver). O motor próprio chega a eles depois de testado nesses sistemas.

## Desenvolver

O app fica em `app/` (Electron, Svelte e TypeScript):

```bash
cd app
npm install
npm run dev
npm test
```

O site fica em `site/` (HTML, CSS e JavaScript, sem build):

```bash
cd site
npm test
```

## Licença

GPL-3.0-or-later.
