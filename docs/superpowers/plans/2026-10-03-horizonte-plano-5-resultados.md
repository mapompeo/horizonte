# Horizonte, Plano 5: instaladores e atualização (resultados)

Data: 03/10/2026. Status: instalador do Windows gerado e aberto aqui; Linux e CI sem prova; assinatura de código e atualização do próprio app ficam abertas.

## Feito
- **Instalador do Windows** (`npm run build:win`): `Horizonte-0.1.0-setup.exe` (89 MB, NSIS, instala só para o usuário, sem administrador, atalho na área de trabalho). Provado aqui: o app empacotado abre com a janela "Horizonte". Marca (appId, nome, executável) trocada do modelo padrão; `publish` do exemplo removido.
- **Linux**: alvos AppImage e deb configurados (o `snap` saiu). **Não gerado**: precisa de Linux ou do CI.
- **CI** (`.github/workflows/ci.yml`): typecheck e testes no Windows e no Ubuntu em todo PR; ao criar uma tag `v*`, empacota os dois e anexa à versão do GitHub. Não rodou ainda (só roda no GitHub).
- **Atualização do motor** (Windows): se o Sunshine instalado for mais antigo que a versão fixada, o Horizonte baixa e instala por cima (mantém configuração e senha). Versão ilegível ou mais nova nunca atualiza. Aqui está igual à fixada (2026.914.233613), então nada muda.

## Aberto
- **Assinatura de código**: o instalador sai `NotSigned`; o Windows mostrará "editor desconhecido" e o SmartScreen/Smart App Control pode barrar. Precisa de um certificado (compra ou Azure Trusted Signing), decisão sua.
- **Atualização do próprio Horizonte** (electron-updater): precisa decidir onde hospedar (repositório privado exige token); por ora atualiza-se instalando a versão nova.
- Atualização do motor no Linux e do Moonlight portátil (a versão fica no `versions.ts`; trocar o hash e o app não rebaixa se já existir).
