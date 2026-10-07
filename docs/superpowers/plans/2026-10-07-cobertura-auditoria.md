# Cobertura da auditoria do Horizonte

Data: 2026-10-07. Worktree: `C:/Users/mathe/dev/tela-extra/.worktrees/auditoria-interface`. Branch: `fix/auditoria-interface`. Base observada: `796d7fb2683d0196a5ee666a3201604f2dda5366`.

## Critérios e limites

Este documento é um inventário de evidências, sem nota de qualidade ou promessa de cobertura total. O inventário foi obtido com `git ls-files app/src app/demo app/native site .github/workflows`: **194 arquivos rastreados**. O código nativo está em `app/native`; não há diretório raiz `native` nesse inventário. Dependências, builds gerados e arquivos ignorados não entram na contagem. Testes e suporte são separados de produção; declarations e entradas HTML pertencem à produção. Configurações externas a esses diretórios não foram inventariadas.

Legenda por arquivo:

- **L**: conteúdo integral efetivamente lido por este agente nesta etapa, inclusive leituras por fatias recompostas. Leitura não significa execução ou prova de ausência de bugs.
- **H**: conteúdo efetivamente lido por este agente nas etapas anteriores desta conversa, sem releitura integral desta versão. Mudanças integradas posteriormente podem não estar cobertas.
- **P**: leitura parcial; não contabilizada como revisão integral.
- **I**: apenas inventariado nesta conversa. Um relatório sobre a área não promove o arquivo a revisado.

O HTML do site permanece P: houve leitura de trechos, diffs e testes anteriores, e uso integral como entrada da reprodução em Chromium; carregar um arquivo no navegador não equivale a ler todo o código. Assets binários e biblioteca minificada não foram auditados visualmente ou linha a linha.

| Categoria | Inventário | L | H | P | I |
| --- | ---: | ---: | ---: | ---: | ---: |
| Produção/workflow | 107 | 39 | 28 | 1 | 39 |
| Teste/suporte | 77 | 6 | 15 | 0 | 56 |
| Configuração/metadado | 6 | 3 | 1 | 0 | 2 |
| Ativo | 2 | 0 | 0 | 0 | 2 |
| Terceiro | 2 | 0 | 0 | 0 | 2 |

## Evidência proveniente de relatórios

Os três relatórios abaixo foram efetivamente lidos nesta etapa. São evidências históricas declaradas pelos autores, sem execução independente agora e sem mapa completo de arquivos lidos:

| Relatório | O que sustenta | Limite |
| --- | --- | --- |
| [Auditoria resultados](2026-10-07-auditoria-resultados.md) | Relata correções de conexão/cancelamento, reconexão, persistência, descoberta, gateway e autostart na base b87572a. | Reconhece leitura individual incompleta. Não valida automaticamente os arquivos I nem o HEAD atual. |
| [Plano 8 resultados](2026-10-07-horizonte-plano-8-resultados.md) | Relata empacotamento nos três sistemas, contagem de telas do auxiliar Mac e testes Linux. | Não prova encoder real no Mac, sessão Windows com PIN real, latência entre máquinas ou Gatekeeper do DMG. |
| [Plano 7 resultados](2026-10-03-horizonte-plano-7-resultados.md) | Registra estratégia e testes de uma versão anterior. | A estratégia Mac descrita ali foi substituída pelo auxiliar nativo atual; não deve ser apresentada como arquitetura vigente. |

Essas evidências são de área, não revisões integrais atribuíveis a cada arquivo. Não há arquivo marcado como integralmente revisado apenas por constar em um relatório.

## Riscos restantes com evidência direta

Severidade: P1 exige atenção antes de ampliar uso/compartilhamento; P2 afeta recuperação, informação ou uso em condições específicas. As situações abaixo são conclusões estáticas, exceto a reprodução CSS explicitamente descrita. Não houve reprodução em macOS nem exploração do canal PIN nesta etapa.

| Prioridade | Caminho e linha | Gatilho e impacto | Sugestão mínima / limite |
| --- | --- | --- | --- |
| P1, segurança para futuras funções de compartilhamento | `app/src/main/engine/pin-channel.ts:53`, `:71`, `:105`; `app/src/main/engine/sunshine/engine.ts:288` | PIN trafega por HTTP na LAN e é associado ao nome normalizado do dispositivo. Outro participante da rede pode interferir no PIN associado a um nome; não existe vínculo autenticado nesse canal. | Autenticar e vincular mensagens à sessão/dispositivo antes de reutilizar esse canal para arquivos ou clipboard. Aprovação humana continua sendo uma barreira; este código não prova acesso remoto não autorizado. Risco já citado no relatório anterior. |
| P2, recuperação Mac | `app/src/main/platform/macos/helper.ts:35`, `:65`; `app/src/main/platform/macos/wire.ts:111`; `app/src/main/engine/sunshine/engine.ts:104` | Auxiliar encerra depois de DISPLAY_ID. A referência ao monitor é limpa no wire, mas o resultado já resolvido do helper não notifica a máquina/engine; prepare pode reutilizar known sem chamar ensureVirtualDisplay, enquanto Sunshine ainda responde. Usuário perde a tela e uma nova preparação pode manter o ID antigo. | Invalidar a preparação ao perder o auxiliar e tornar a perda visível/recuperável. Teste helper existente aceita saída após pronto sem erro solto, mas não testa recuperação do engine. Requer reprodução integrada no Mac. |
| P2, layout nativo | `app/native/macos/main.swift:63` | Falha ao iniciar ou concluir a configuração de origem. O auxiliar ignora o resultado de CGConfigureDisplayOrigin/CGCompleteDisplayConfiguration e ainda imprime DISPLAY_ID; sucesso de criação não confirma posicionamento à direita. | Conferir retornos e comunicar falha de layout. `display.e2e.ts` verifica contagem e remoção de telas, não origem. Condição de falha não reproduzida no Mac. |
| P2, estado do acesso web | `app/src/main/web/gateway.ts:114`; `app/src/renderer/src/screens/Ready.svelte:20`; `app/src/shared/api.ts:29` | Gateway morre depois da consulta inicial. Backend muda para on:false, mas Ready consulta na montagem e após ação; não há assinatura de estado web nessa API. Instruções e credenciais podem continuar visíveis como ativas até nova ação/remontagem. | Publicar alteração de acesso web ou revalidar enquanto ativo. Diferente do erro de toggle já corrigido. Fluxo estático, sem matar gateway real nesta etapa. |
| P2, inicialização da UI de updates | `app/src/renderer/src/components/UpdateControls.svelte:7`, `:11`, `:35` | Evento onUpdate chega antes da resolução de getUpdateStatus: resposta anterior pode sobrescrever evento mais novo. Se consulta inicial rejeita sem evento posterior, status fica null e seção inteira some sem retry. | Não sobrescrever evento recebido com consulta antiga; mostrar falha e retry na consulta inicial. Testes do updater main lidos não cobrem esse componente. Não foi editado nem executado aqui. |
| P2, orientação de download móvel | `site/js/os.js:6`; `site/js/main.js:11` | iPhone/iPad recebem destaque “Seu sistema” em macOS; Android/ChromeOS em Linux. Isso destaca instaladores de desktop incompatíveis como se fossem para o aparelho atual. | Distinguir sistema móvel/desconhecido e orientar recepção pelo navegador quando aplicável. Classificação explícita no código; não houve instalação móvel. |
| P2, resumo em tablet | `site/styles.css:2184`, `:2255`, `:2258` | Entre 701 e 900 px, regra posterior de áreas com seis colunas sobrescreve áreas do breakpoint de duas colunas e cria quatro colunas implícitas. Cartões ficam estreitos. | Manter a regra de seis colunas apenas acima do breakpoint ou restaurar áreas tablet depois dela. Reproduzido em Chromium headless a 768×1024 com HTML/CSS atuais: seis tracks, três cartões com cerca de 76 px; grid 724 px sem overflow global. Não é prova de todos os conteúdos inacessíveis. |

O no-op de bitrate no receptor já era conhecido e não foi reinvestigado. A implementação de bitrate no emissor também explicita aplicação na próxima sessão (`engine.ts:375`); a presença de controles na demo não prova autoquality em sessão real. Não atribuo conclusão de funcionamento ao produto sem esse teste.

## Lacunas prioritárias de investigação e validação

São riscos de cobertura, não bugs novos confirmados:

| Prioridade de investigação | Caminhos | O que ainda falta |
| --- | --- | --- |
| Alta | `app/src/main/platform/windows/{elevation,driver-script,download,secrets,setup,wire}.ts` | Ler integralmente fluxos elevados, rollback, integridade de downloads e armazenamento de credenciais. Execução e reports anteriores não substituem essa análise. |
| Alta | `app/src/main/engine/moonlight/{client,run,paired-hosts}.ts`; `app/src/main/engine/sunshine/{api,pairing-watcher,session-watcher,restart}.ts` | Conferir implementação atual de concorrência, identidade, encerramento e reconexão. Relatório relata correções, mas estes arquivos seguem I nesta conversa. |
| Alta | `app/src/main/platform/linux/{session,setup,wire,moonlight}.ts`; `app/src/main/platform/macos/{moonlight,versions}.ts` | Ler implementações e testar permissões/sessões do usuário em plataformas reais. Para Mac: encoder/transmissão após criação da tela e recuperação após perda do helper. |
| Alta | `app/src/main/core/updater.ts`; `.github/workflows/ci.yml`; configuração de empacotamento fora deste inventário | O fluxo main e metadados de release foram lidos; não houve teste de download/instalação real, assinatura/notarização, downgrade ou recuperação. O CI verifica assinatura ad hoc no Mac, o que não demonstra aceitação pelo Gatekeeper. Não concluir falha de integridade sem ler a cadeia externa de empacotamento. |
| Média | `app/src/main/core/{machine,settings,encoder}.ts`; `app/src/main/engine/discovery.ts` | Ler state machine, persistência e heurísticas atuais; validar autoquality com telemetria e mudança real de transporte entre duas máquinas. |
| Média | `site/index.html`; `site/vendor/motion.min.js`; `app/src/renderer/src/screens/SettingsPage.svelte` | Completar HTML, avaliar dependência externa e reler SettingsPage integrado. Acessibilidade por leitores de tela, contraste e interação real não foram validados integralmente nesta etapa. |

## Validação realmente realizada

Nesta etapa: inventário Git, leitura de fontes/testes/relatórios e reprodução isolada do CSS em Chromium via Playwright (`page.setContent` + `addStyleTag`, viewport 768×1024). Sem servidor local, sem alteração de porta, sem execução do app Electron. Foram lidos os testes nativos, mas não executados em Windows como se fossem macOS.

Histórico da conversa: 614 testes Vitest e typecheck na etapa da interface; 41 testes Node do site e 36 testes browser na etapa anterior do site, além de build demo/typecheck. Esses resultados são anteriores à revisão/rebase para 796d7fb e **não são resultados reexecutados nesta etapa ou garantia do HEAD atual**. CI pendente conforme informação do usuário, sem consulta ao CI nesta tarefa. Não houve novos testes unitários, typecheck ou suíte E2E completa para este documento.

## Inventário por arquivo

Cada linha abaixo corresponde a um arquivo rastreado retornado pelo comando de inventário. L/H/P/I seguem os critérios acima; caminhos são relativos à raiz da worktree. Os arquivos I não têm revisão direta reivindicada.

| Arquivo | Categoria | Evidência |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Produção/workflow | L |
| `.github/workflows/e2e.yml` | Produção/workflow | L |
| `.github/workflows/pages.yml` | Produção/workflow | L |
| `app/demo/Preview.svelte` | Produção/workflow | H |
| `app/demo/index.html` | Produção/workflow | L |
| `app/demo/main.ts` | Produção/workflow | L |
| `app/demo/node-stub.ts` | Produção/workflow | L |
| `app/demo/shim.test.ts` | Teste/suporte | H |
| `app/demo/shim.ts` | Produção/workflow | H |
| `app/native/macos/CGVirtualDisplay.h` | Produção/workflow | L |
| `app/native/macos/build.sh` | Produção/workflow | L |
| `app/native/macos/main.swift` | Produção/workflow | L |
| `app/src/main/core/controller.test.ts` | Teste/suporte | I |
| `app/src/main/core/controller.ts` | Produção/workflow | L |
| `app/src/main/core/diagnostic.test.ts` | Teste/suporte | I |
| `app/src/main/core/diagnostic.ts` | Produção/workflow | L |
| `app/src/main/core/encoder.test.ts` | Teste/suporte | I |
| `app/src/main/core/encoder.ts` | Produção/workflow | I |
| `app/src/main/core/machine.test.ts` | Teste/suporte | I |
| `app/src/main/core/machine.ts` | Produção/workflow | I |
| `app/src/main/core/settings.test.ts` | Teste/suporte | I |
| `app/src/main/core/settings.ts` | Produção/workflow | I |
| `app/src/main/core/updater.test.ts` | Teste/suporte | L |
| `app/src/main/core/updater.ts` | Produção/workflow | L |
| `app/src/main/dev-demo.ts` | Produção/workflow | I |
| `app/src/main/engine/compose.test.ts` | Teste/suporte | I |
| `app/src/main/engine/compose.ts` | Produção/workflow | L |
| `app/src/main/engine/discovery.test.ts` | Teste/suporte | I |
| `app/src/main/engine/discovery.ts` | Produção/workflow | I |
| `app/src/main/engine/fake.ts` | Produção/workflow | I |
| `app/src/main/engine/moonlight/client.test.ts` | Teste/suporte | I |
| `app/src/main/engine/moonlight/client.ts` | Produção/workflow | I |
| `app/src/main/engine/moonlight/install.test.ts` | Teste/suporte | I |
| `app/src/main/engine/moonlight/install.ts` | Produção/workflow | I |
| `app/src/main/engine/moonlight/paired-hosts.test.ts` | Teste/suporte | I |
| `app/src/main/engine/moonlight/paired-hosts.ts` | Produção/workflow | I |
| `app/src/main/engine/moonlight/run.test.ts` | Teste/suporte | I |
| `app/src/main/engine/moonlight/run.ts` | Produção/workflow | I |
| `app/src/main/engine/pin-channel.test.ts` | Teste/suporte | I |
| `app/src/main/engine/pin-channel.ts` | Produção/workflow | L |
| `app/src/main/engine/port.ts` | Produção/workflow | L |
| `app/src/main/engine/sunshine/api.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/api.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/encoder-probe.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/encoder-probe.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/engine.prepare.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/engine.runtime.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/engine.ts` | Produção/workflow | L |
| `app/src/main/engine/sunshine/log-file.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/log-file.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/log.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/log.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/memory.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/memory.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/pairing-watcher.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/pairing-watcher.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/restart.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/restart.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/session-watcher.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/session-watcher.ts` | Produção/workflow | I |
| `app/src/main/engine/sunshine/testing/fake-process.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/testing/fake-sunshine.test.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/testing/fake-sunshine.ts` | Teste/suporte | I |
| `app/src/main/engine/sunshine/testing/localhost-cert.pem` | Teste/suporte | I |
| `app/src/main/engine/sunshine/testing/localhost-key.pem` | Teste/suporte | I |
| `app/src/main/engine/sunshine/testing/log-samples.ts` | Teste/suporte | I |
| `app/src/main/index.ts` | Produção/workflow | L |
| `app/src/main/platform/autostart.test.ts` | Teste/suporte | I |
| `app/src/main/platform/autostart.ts` | Produção/workflow | I |
| `app/src/main/platform/downloads.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/existing.test.ts` | Teste/suporte | I |
| `app/src/main/platform/existing.ts` | Produção/workflow | I |
| `app/src/main/platform/linux/install.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/linux/linux.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/linux/linux.test.ts` | Teste/suporte | I |
| `app/src/main/platform/linux/moonlight.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/linux/moonlight.test.ts` | Teste/suporte | I |
| `app/src/main/platform/linux/moonlight.ts` | Produção/workflow | I |
| `app/src/main/platform/linux/session.ts` | Produção/workflow | I |
| `app/src/main/platform/linux/setup.ts` | Produção/workflow | I |
| `app/src/main/platform/linux/versions.ts` | Produção/workflow | I |
| `app/src/main/platform/linux/wire.ts` | Produção/workflow | I |
| `app/src/main/platform/macos/display.e2e.ts` | Teste/suporte | L |
| `app/src/main/platform/macos/helper.test.ts` | Teste/suporte | L |
| `app/src/main/platform/macos/helper.ts` | Produção/workflow | L |
| `app/src/main/platform/macos/install.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/macos/macos.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/macos/macos.test.ts` | Teste/suporte | I |
| `app/src/main/platform/macos/moonlight.test.ts` | Teste/suporte | I |
| `app/src/main/platform/macos/moonlight.ts` | Produção/workflow | I |
| `app/src/main/platform/macos/setup.ts` | Produção/workflow | L |
| `app/src/main/platform/macos/versions.ts` | Produção/workflow | I |
| `app/src/main/platform/macos/wire.ts` | Produção/workflow | L |
| `app/src/main/platform/types.ts` | Produção/workflow | L |
| `app/src/main/platform/windows/download.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/download.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/driver-script.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/driver-script.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/elevation.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/elevation.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/probes.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/probes.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/real-ps.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/sac.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/secrets.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/secrets.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/setup.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/setup.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/smart-app-control.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/version-compare.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/version-compare.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/versions.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/versions.ts` | Produção/workflow | I |
| `app/src/main/platform/windows/windows.e2e.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/wire.test.ts` | Teste/suporte | I |
| `app/src/main/platform/windows/wire.ts` | Produção/workflow | I |
| `app/src/main/web/gateway.test.ts` | Teste/suporte | I |
| `app/src/main/web/gateway.ts` | Produção/workflow | L |
| `app/src/main/web/wire.ts` | Produção/workflow | L |
| `app/src/preload/index.d.ts` | Produção/workflow | H |
| `app/src/preload/index.ts` | Produção/workflow | L |
| `app/src/renderer/index.html` | Produção/workflow | I |
| `app/src/renderer/src/App.svelte` | Produção/workflow | H |
| `app/src/renderer/src/App.test.ts` | Teste/suporte | H |
| `app/src/renderer/src/assets/layout.test.ts` | Teste/suporte | H |
| `app/src/renderer/src/assets/main.css` | Produção/workflow | L |
| `app/src/renderer/src/components/CopyButton.svelte` | Produção/workflow | H |
| `app/src/renderer/src/components/Pill.svelte` | Produção/workflow | H |
| `app/src/renderer/src/components/Segmented.svelte` | Produção/workflow | H |
| `app/src/renderer/src/components/Stepper.svelte` | Produção/workflow | H |
| `app/src/renderer/src/components/Toggle.svelte` | Produção/workflow | H |
| `app/src/renderer/src/components/TopBar.svelte` | Produção/workflow | H |
| `app/src/renderer/src/components/UpdateControls.svelte` | Produção/workflow | L |
| `app/src/renderer/src/env.d.ts` | Produção/workflow | I |
| `app/src/renderer/src/lib/actions.ts` | Produção/workflow | H |
| `app/src/renderer/src/lib/copy.test.ts` | Teste/suporte | H |
| `app/src/renderer/src/lib/copy.ts` | Produção/workflow | H |
| `app/src/renderer/src/lib/hosts.test.ts` | Teste/suporte | H |
| `app/src/renderer/src/lib/hosts.ts` | Produção/workflow | H |
| `app/src/renderer/src/lib/store.test.ts` | Teste/suporte | H |
| `app/src/renderer/src/lib/store.ts` | Produção/workflow | H |
| `app/src/renderer/src/main.ts` | Produção/workflow | H |
| `app/src/renderer/src/screens/Approve.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/Choose.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/Connected.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/Discover.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/ErrorScreen.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/Install.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/Preparing.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/Ready.svelte` | Produção/workflow | L |
| `app/src/renderer/src/screens/Receiving.svelte` | Produção/workflow | H |
| `app/src/renderer/src/screens/SettingsPage.svelte` | Produção/workflow | H |
| `app/src/shared/address.test.ts` | Teste/suporte | H |
| `app/src/shared/address.ts` | Produção/workflow | H |
| `app/src/shared/api.ts` | Produção/workflow | L |
| `app/src/shared/events.test.ts` | Teste/suporte | H |
| `app/src/shared/events.ts` | Produção/workflow | H |
| `app/src/shared/names.test.ts` | Teste/suporte | I |
| `app/src/shared/names.ts` | Produção/workflow | L |
| `app/src/shared/pin.test.ts` | Teste/suporte | I |
| `app/src/shared/pin.ts` | Produção/workflow | L |
| `app/src/shared/quality.test.ts` | Teste/suporte | I |
| `app/src/shared/quality.ts` | Produção/workflow | H |
| `app/src/shared/types.ts` | Produção/workflow | H |
| `app/src/shared/updates.ts` | Produção/workflow | L |
| `site/.gitignore` | Configuração/metadado | I |
| `site/e2e/reliability.spec.mjs` | Teste/suporte | H |
| `site/e2e/server.mjs` | Teste/suporte | L |
| `site/e2e/site.spec.mjs` | Teste/suporte | H |
| `site/icon.png` | Ativo | I |
| `site/index.html` | Produção/workflow | P |
| `site/js/live.js` | Produção/workflow | L |
| `site/js/main.js` | Produção/workflow | L |
| `site/js/matrix.js` | Produção/workflow | L |
| `site/js/os.js` | Produção/workflow | L |
| `site/js/releases.js` | Produção/workflow | L |
| `site/js/scenes.js` | Produção/workflow | L |
| `site/js/story.js` | Produção/workflow | L |
| `site/og.png` | Ativo | I |
| `site/package-lock.json` | Configuração/metadado | I |
| `site/package.json` | Configuração/metadado | L |
| `site/playwright.config.mjs` | Configuração/metadado | H |
| `site/robots.txt` | Configuração/metadado | L |
| `site/sitemap.xml` | Configuração/metadado | L |
| `site/styles.css` | Produção/workflow | L |
| `site/tests/html.test.js` | Teste/suporte | H |
| `site/tests/live.test.js` | Teste/suporte | H |
| `site/tests/matrix.test.js` | Teste/suporte | L |
| `site/tests/os.test.js` | Teste/suporte | H |
| `site/tests/releases.test.js` | Teste/suporte | H |
| `site/tests/story.test.js` | Teste/suporte | L |
| `site/tests/workflow.test.js` | Teste/suporte | H |
| `site/vendor/LICENSE-motion.txt` | Terceiro | I |
| `site/vendor/motion.min.js` | Terceiro | I |

## Encerramento desta etapa

Somente este documento foi criado. Nenhum código de produção foi alterado por esta tarefa. Sem commit, push, merge ou rebase. Este inventário permite priorizar a próxima leitura, mas não certifica confiabilidade completa, updates completos, autoquality validado ou future sharing seguro.

