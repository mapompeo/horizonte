# Horizonte, Plano 4: Linux (Ubuntu com Xorg), resultados

Data: 03/10/2026. Status: código pronto e testado só com falsos (469 testes). **Nada foi rodado num Linux de verdade**: esta máquina não tem WSL nem distribuição instalada, então tudo abaixo é hipótese até a prova num Ubuntu.

## Feito (`app/src/main/platform/linux/`)
- `versions.ts`: pacote `.deb` do Sunshine 2026.914 para Ubuntu 22.04, 24.04 e 26.04 (amd64), com o SHA-256 que a API do GitHub publica; outras distribuições e processadores são recusados com frase clara.
- `session.ts`: detecta Xorg ou Wayland; no Wayland o Horizonte para e orienta a escolher "Ubuntu on Xorg" (nada de contornar).
- `setup.ts`: instalação com UM aviso do sistema (`pkexec`): copia para `/var/lib/horizonte/stage`, confere o hash de novo e roda `apt-get install`; senha criada com `sunshine --creds` como usuário comum e guardada no cofre; serviço ligado por `systemctl --user enable [--now] sunshine`; monitor virtual por `xrandr --fb` + `xrandr --setmonitor HorizonteVirtual 1920/508x1080/286+<largura atual>+0 none`, refeito a cada preparação (some ao encerrar a sessão).
- `wire.ts` e `index.ts`: ligados quando o app roda empacotado no Linux (ou com `HORIZONTE_ENGINE=install`). O receptor no Linux continua "ainda não disponível".

## A provar num Ubuntu (Xorg)
1. O `.deb` instala sem dependências faltando e o serviço de usuário `sunshine` existe (nome da unidade).
2. `sunshine --creds` grava a senha no `~/.config/sunshine` e a API responde com ela.
3. O Sunshine **enxerga o monitor criado por `xrandr --setmonitor`** (ele pode listar só saídas RandR, não monitores lógicos); se não, trocar por driver dummy do Xorg ou `xrandr` numa saída desconectada. O `isVirtual` depende do nome que aparecer no log.
4. O cofre: o `safeStorage` do Electron no Linux precisa de libsecret (GNOME Keyring); sem ele cai em armazenamento fraco e o app recusa guardar.
5. Receptor no Linux (Moonlight por Flatpak/AppImage) fica para depois.
