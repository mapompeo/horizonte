# Instalação limpa e beta.10, 08/10/2026

## Integração concluída

PRs #60, #62, #64 e #65 integrados após todas as verificações aplicáveis passarem. A falha Windows era o prazo de cinco segundos do teste de registro, menor que o prazo de vinte segundos do PowerShell; o teste real agora permite vinte e cinco segundos. A falha Mac no #62 usava o teste antigo que encerrava o monitor antes do pareamento e não limpava o processo em erro; a sequência corrigida do #60 foi integrada e validada.

PR #67 integrou `0.1.0-beta.10`; tag `v0.1.0-beta.10` aponta para `628e499`. Testes unitários da tag passaram nos três sistemas. Os testes E2E do PR também passaram nos três sistemas antes da publicação. Conferir o resultado final da execução de publicação `37726096433` e os assets no GitHub.

Publicação concluída com sucesso: testes e empacotamento nos três sistemas. Assets Windows, Linux e Mac Intel/Apple Silicon disponíveis na [release beta.10](https://github.com/mapompeo/horizonte/releases/tag/v0.1.0-beta.10), incluindo os manifestos de atualização e blockmaps.

## Limpeza local autorizada

O usuário confirmou remover tudo usado pelo Horizonte. Desinstaladores oficiais removeram Horizonte e Sunshine. PnPUtil removeu apenas `oem46.inf`, identificado como MttVDD, sem tocar nos drivers Parsec. Regras de firewall Sunshine/Horizonte foram removidas. Dados e sobras foram movidos para uma cópia de recuperação fora das pastas ativas, não apagados permanentemente.

Verificação local: executável do Horizonte ausente; serviço Sunshine ausente; diretório Program Files/Sunshine ausente; driver MttVDD não está presente e seu INF foi removido; AppData/Roaming/horizonte ausente; zero regras de firewall com os nomes selecionados. A cópia de recuperação contém dados privados e não deve ser versionada nem enviada ao dontpad.

## Atualizações e teste físico

Windows NSIS e Linux AppImage têm atualização pelo app. A beta.9 publicada não tinha esse recurso: a primeira passagem para beta.10 requer o novo instalador. Depois, buscar/baixar/instalar por Ajustes. Não há instalação automática enquanto houver sessão ativa. Mac e .deb continuam manuais.

Teste real de consulta e download pelo atualizador passou: executável empacotado local com versão beta.9 e código do atualizador encontrou a beta.10 publicada no GitHub, baixou o pacote e retornou `phase: ready`, `percent: 100`. SHA512 do instalador baixado foi conferido separadamente contra o manifesto publicado. O teste utilizou perfil temporário isolado e não instalou componentes; o cache criado também foi movido para recuperação ao finalizar. Evidência local: `AppData/Local/Temp/hz-update-check-27yQDm/result.json`. A beta.9 pública não tem esse atualizador; o teste utilizou um build local da versão anterior, não uma instalação daquela release pública. Não foi exercitada a instalação da atualização. Será necessária uma versão posterior à beta.10 para repetir esse teste nas instalações reais dos dois PCs.

Para teste físico: instalar beta.10 nos dois Windows, escolher Enviar no emissor e Mostrar no receptor, autorizar o pareamento, conferir imagem/interação, repetir Sair/Estender e reabrir para conferir o modo lembrado. Não chamar esse fluxo de validado antes do resultado dos dois computadores.

## Pausa preservada

Automação de auditoria continua PAUSED. Trabalho local de perda do helper Mac permanece preservado em `.worktrees/mac-helper-loss`, fora desta release. Não iniciar novas frentes automaticamente.
