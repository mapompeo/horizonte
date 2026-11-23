# Checkpoint da auditoria, 07/10/2026

Salvo após o pedido do usuário para concluir os lotes atuais, parar um pouco e preservar o estado antes de acabar o contexto. Não declara a auditoria inteira concluída.

## Estado integrado

- Remoto `origin/main`: `8b16ac7`, após PR #63. Checkout principal em `C:/Users/mathe/dev/tela-extra`, limpo, estava em `348cd6d`; atualizar somente com fast-forward.
- Integrados e verificados: #50 confiabilidade, #51 atualizador, #53 interface/demo, #54 recuperação de plataformas, #55 canal PIN, #56 CI/rede, #57 cofre/memória, #58 histórico de diagnóstico, #59 cancelamento da instalação, #52 motor/configuração/pareamentos, #61 site responsivo, #63 relatório.
- Motor #52: 686 testes e tipagem passaram localmente; CI e E2E passaram nos três sistemas antes de integrar.
- Site #61: 41 testes unitários e 60 de navegador passaram. Grade em tablet corrigida, downloads móveis recebem orientação de navegador.
- Versão do app e última release continuam `0.1.0-beta.9`. Nenhuma nova release foi publicada nesta rodada.

## Lotes em validação

| PR | Branch/worktree | Estado e próximo passo |
| --- | --- | --- |
| [#60](https://github.com/mapompeo/horizonte/pull/60) | `fix/auditoria-mac-layout`, `.worktrees/auditoria-mac-layout` | Head `7b39ecb`. Swift compilou e todos os testes de disposição/argumentos passaram no primeiro CI. Instalação/pareamento Mac falhou e deixou processo aberto. Teste corrigido para manter monitor vivo até o finally, limpar grupo do Moonlight em todas as saídas e limitar chamadas da API. Nova CI pendente. Não integrar sem validar essa rodada. |
| [#62](https://github.com/mapompeo/horizonte/pull/62) | `fix/auditoria-updates-ui`, `.worktrees/auditoria-updates-ui` | Head `1c6574d`. Eventos recentes não são sobrescritos por consultas/ações antigas; erro inicial tem retry. Nove testes do componente, jsdom 30.1.2 declarado. CI unitária passou nos três sistemas, E2E Mac ainda pendente na consulta. Build e dez passos E2E Windows locais passaram. Suíte local após rebase teve uma falha no teste preexistente de prazo de download, tratado em #64. |
| [#64](https://github.com/mapompeo/horizonte/pull/64) | `fix/teste-download-prazo`, `.worktrees/download-timeout-test` | Relógio controlado, mantendo HTTP/pipeline/hash/disco reais. Teste prova transferência maior que prazo e renovação a cada chunk; mutação sem renovação falhou. Suíte com 56 workers passou antes de rebase; CI atual pendente. |
| [#65](https://github.com/mapompeo/horizonte/pull/65) | `fix/auditoria-boot-main`, `.worktrees/auditoria-boot-main` | Janela antes de autostart; erro acionável preserva causa; fatal do boot exibe diálogo e encerra. Sete testes pertinentes e suíte local passaram antes de rebase; CI pendente. |

Consultar checks atuais, não tratar estas fotografias como resultados finais. Ao integrar, usar o SHA completo do HEAD da worktree com `gh pr merge --squash --match-head-commit` após todos os checks relevantes aprovarem.

## Trabalho ainda local

`.worktrees/mac-helper-loss`, branch `fix/mac-helper-loss`, base `348cd6d`: detecção de perda inesperada do helper após Pronto, invalidação do cache do motor, erro e RETRY com nova tela. Arquivos modificados: engine.ts, index.ts, helper.ts/test.ts, wire.ts, types.ts; novos display-loss.ts, display-loss.test.ts, helper-loss.e2e.ts, wire.test.ts. Em implementação/testes no momento deste checkpoint; não está commitado nem em PR. Revisar antes de publicar. Não sobrescrever esse trabalho.

Agente responsável: Hypatia `01a1178e-24f6-7bd2-b9cf-13adf4553947`. Foi orientada a encerrar o escopo atual e não iniciar novas melhorias. Bernoulli e Linnaeus concluíram os lotes de boot e teste de download.

## Pausa e continuidade

- Automação `auditoria-cont-nua-do-horizonte` foi colocada em **PAUSED** a pedido do usuário. Não reativar sem novo pedido.
- Não abrir novas frentes. Concluir apenas os lotes já em validação, registrar resultado e parar. Se a sessão encerrar antes dos checks, este documento é o ponto de retomada.
- Nenhuma compra de certificado, assinatura oficial ou transmissão Mac/Windows em hardware físico foi realizada. Não alegar essas validações.
- Ainda pendentes fora dos lotes: pkill do Sunshine sem escopo no adaptador Mac, atualização do status do gateway na interface após morrer, qualidade do receptor que só muda na próxima conexão, canal autenticado para compartilhamento de arquivos/clipboard e integração Deskflow.
- Novos recursos de update ainda precisam teste entre duas releases publicadas. Windows e Linux AppImage suportam o atualizador; macOS e .deb atualizam manualmente.

## Cuidados na retomada

- Preservar alterações locais. Não limpar worktrees até conferir status, integração e dependências.
- Várias worktrees usam junction de node_modules apontando para `.worktrees/atualizacao-app/app/node_modules`. Não remover esse destino enquanto houver consumidores. `auditoria-updates-ui` agora tem instalação independente.
- Usar pt-BR, respostas curtas, sem atribuição de IA em commits. Não matar processos sem PID/grupo/serviço específico.
- Relatórios complementares: `2026-10-07-auditoria-resultados.md` e `2026-10-07-cobertura-auditoria.md`. O inventário é o recorte de um revisor, não comprovação de leitura linha a linha do repositório inteiro.
