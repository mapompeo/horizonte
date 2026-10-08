# Beta.13 publicada e atualização instalada

## Estado publicado

- Código da release: `3b5f3237e752036373c9363b48304366a485910a`.
- Release: https://github.com/mapompeo/horizonte/releases/tag/v0.1.0-beta.13
- CI da release: https://github.com/mapompeo/horizonte/actions/runs/37781757122
- Testes e empacotamento Windows, Linux e macOS concluídos com sucesso.
- CI, E2E e publicação do site na main também concluídos com sucesso.
- 735 testes locais e dez etapas da interface no Electron real do Windows passaram.

## Atualização real do Windows

O teste abriu o executável da instalação existente em `%LOCALAPPDATA%\Programs\horizonte`, usando um perfil temporário para não iniciar preparação de hardware durante o ensaio.

1. O atualizador da beta.10 encontrou a beta.13.
2. O download pelo atualizador chegou a `ready`, com 100%.
3. A ação `install` foi executada pelo próprio aplicativo.
4. O `package.json` do `app.asar` da instalação passou a informar `0.1.0-beta.13`.
5. A nova janela Horizonte abriu. O código instalado contém desinstalação, revisão de diagnóstico e a montagem corrigida do roteiro elevado.

Evidência local: `%TEMP%\hz-update-install-UrPm7Z\result.json`. Nenhum instalador foi baixado ou executado manualmente pelo navegador durante esse teste. A evidência confirma instalação pelo atualizador, não uma transferência diferencial menor em bytes.

## Recursos e limites

Enviar diagnóstico permite revisar metadados e códigos de erro antes de abrir uma Issue pública. A publicação exige login e confirmação no GitHub. Histórico de sete dias é opcional. Não há telemetria automática ou painel privado.

Relatos: https://github.com/mapompeo/horizonte/issues?q=is%3Aissue+label%3Adiagnostico

Desinstalar Horizonte abre o desinstalador oficial no Windows, após confirmação e verificação de conexão/atualização ativa. Os componentes compartilhados permanecem. Mac e Linux exibem instruções de remoção pelo sistema. Os testes de interface não removeram a instalação usada pelo usuário.

A recuperação física do monitor neste PC permanece pendente. A etapa privilegiada da tentativa nativa não produziu resultado, e o dispositivo MTT continuava sem classe Display. Isso não permite afirmar que o monitor foi recuperado. A próxima preparação deve ter o consentimento de instalação do driver e do Windows.

O caso de dispositivo órfão, a vinculação do driver e a sintaxe do roteiro completo são cobertos por testes com PowerShell real. Isso não substitui transmissão de vídeo em dois computadores físicos.

## Releases anteriores deste lote

A beta.11 não gerou instaladores porque o compilador C# do teste excedeu o prazo padrão de cinco segundos. O prazo específico foi ajustado com limite do processo e a asserção mantida.

A beta.12 foi retirada da distribuição após o ensaio completo revelar a indentação inválida da here-string. A beta.13 contém essa correção. Nenhum sucesso de teste de fragmento deve ser tratado como prova da montagem completa do instalador.
