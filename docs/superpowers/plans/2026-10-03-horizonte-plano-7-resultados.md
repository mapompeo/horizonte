# Horizonte, Plano 7: macOS, Android e iOS (resultados)

Data: 03/10/2026. Status: código do macOS (enviar) pronto e testado só com falsos (491 testes); **nada rodou num Mac**. Android e iOS: decisão de arquitetura, sem código novo.

## macOS (enviar) — `app/src/main/platform/macos/`
- `versions.ts`: Sunshine 2026.914 em `.dmg` para Apple Silicon e Intel, com o SHA-256 da API do GitHub.
- `setup.ts`: baixa e confere o hash, monta o `.dmg` (`hdiutil`), copia `Sunshine.app` para `~/Applications` (**sem administrador**), cria a credencial (`sunshine --creds`), abre o app e leva a pessoa aos Ajustes de gravação de tela.
- **Monitor virtual:** o macOS não tem como criar um sozinho e o Horizonte não tenta (nada de API privada). Com uma tela só, o app para e explica: plugue HDMI "dummy" ou BetterDisplay. Com duas ou mais, qualquer tela que não seja a principal serve.
- `wire.ts` e `index.ts`: ligados no app empacotado no Mac (ou `HORIZONTE_ENGINE=install`). Alvo `dmg` e job `macos-latest` no CI (sem assinatura: conta Apple pendente).

## A provar num Mac
1. `hdiutil attach` e a cópia do `.app` sem administrador; o Sunshine abrir como app do usuário e escutar na 47990.
2. `sunshine --creds` no caminho `Contents/MacOS/sunshine`; o log em `~/.config/sunshine/sunshine.log`.
3. Permissão de gravação de tela: se o Sunshine pede sozinho ao primeiro quadro, ou se o Horizonte precisa guiar antes.
4. O Sunshine enxergar a tela dummy/BetterDisplay como segunda tela (o `isVirtual` usa "não é a principal").
5. Receber no Mac (Moonlight `.dmg` 6.1.0) e o app sem assinatura ser aberto (Gatekeeper). Ficam para depois.

## Android e iOS
Não vale escrever app nativo agora: o **receptor no navegador (plano 6) já serve os dois**, sem loja, e o Moonlight oficial existe na Play Store e na App Store como alternativa de quem quer qualidade máxima (pareia pelo PIN manual que o Horizonte já aprova). Um app Horizonte móvel só se justifica depois, para descobrir e parear sem digitar nada; fica como ideia pós-v1.
