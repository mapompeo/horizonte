# Auditoria e melhorias em 07/10/2026

Base: b87572a. Revisão em andamento; este documento não declara o pedido inteiro concluído.

## Integrações verificadas até 07/10, 16h25

Base integrada: 0515145. Os PRs abaixo chegaram à main após aprovação das verificações aplicáveis. Contagens de testes pertencem a cada lote e não devem ser somadas.

| Lote | Resultado integrado | Validação |
| --- | --- | --- |
| #50 | Recuperação limitada de sessão, ajustes confirmados em disco e encerramento de recursos | Testes de falha e CI nos três sistemas |
| #51 | Atualizador com download e instalação explícitos, proteção de sessão ativa | CI, build Windows e conferência do hash do instalador e manifesto |
| #53 | Inicialização da interface com erro recuperável, estado recente preservado e demo do site com confirmação de montagem | Testes da interface e navegador |
| #54 e #59 | Recuperação de instalações existentes e cancelamento propagado pelas etapas dos três sistemas | Testes de falha/cancelamento e CI nos três sistemas |
| #55 | Canal PIN sem porta residual ao cancelar a abertura | Teste de corrida entre abertura e encerramento |
| #56 | Limites para instalação de dependências no CI e interrupção de etapas após falha | CI aprovado; inspeção dos logs de falha do mirror APT |
| #57 | Gravações do cofre e memória serializadas; exclusão não ressuscita credenciais | Testes de gravações concorrentes e falha de disco |
| #58 | Histórico local limitado a dez erros e sete dias, com remoção de formatos conhecidos de credenciais | Testes de retenção/redação; dez passos E2E locais no Windows |
| #52 | Configuração do Sunshine e pareamentos serializados; resultado tardio de preparação cancelada descartado | 686 testes locais, tipagem sem erros e CI/E2E nos três sistemas |
| #61 | Grade do resumo em tablets e orientação de navegador para dispositivos móveis | 41 testes unitários e 60 testes de navegador |

Atualização automática está disponível no código para Windows empacotado e Linux AppImage. macOS e instalações .deb seguem atualização manual. A migração entre duas releases publicadas usando o atualizador ainda precisa de validação; beta.9 foi publicada antes desse recurso. O instalador Windows inspecionado permanece sem assinatura Authenticode.

Em validação, fora das integrações acima: disposição do monitor virtual no Mac (#60), proteção contra respostas atrasadas na interface do atualizador (#62), perda inesperada do helper do Mac, falhas de inicialização e estabilização do teste de download sob carga. Estes itens não devem ser apresentados como concluídos.

O [inventário de cobertura](2026-10-07-cobertura-auditoria.md) registra o recorte de um revisor. Sua classificação por arquivo não representa a união de todas as revisões nem prova leitura linha a linha de todo o repositório.

## Achados corrigidos nesta etapa

| Área | Problema observado no código | Correção | Evidência |
| --- | --- | --- | --- |
| Moonlight | Sair antes de spawn concluir deixa transmissão abrir depois | Geração de operação invalida resultado tardio e encerra filho | Teste reproduziu falha antes da correção |
| Moonlight | Duas conexões passam pelo mesmo await antes de registrar processo | Reserva tentativa antes do primeiro await | Teste reproduziu tentativa concorrente |
| Recuperação | Queda de sessão estabelecida exige ação manual | Tentativas limitadas, com cancelamento por geração | Testes de recuperação, cancelamento e falha ao reabrir |
| Ajustes | Erro de disco mantém valor não salvo na memória | Fila de gravações, publicação após confirmação | Teste de disco cheio falhou antes da correção |
| Descoberta | Cada busca cria Bonjour sem liberar instância | Parar browser e destruir Bonjour ao terminar busca | Inspeção do ciclo de vida; testes existentes de descoberta |
| Gateway | Processo morto continua aparecendo ligado | Vigiar saída, limpar processo e permitir nova partida | Teste de saída inesperada falhou antes da correção |
| Gateway | JSON inválido em callback de execFile causa exceção não tratada | Capturar parse e rejeitar Promise; limitar print-config/login | Inspeção de tratamento de erros |
| Cofre Linux | basic_text aceito como se fosse cofre seguro | Recusar backend inseguro | Teste reproduziu aceitação indevida; documentação Electron |
| Inicialização | Abrir com sistema só gravava boolean | API nativa Windows/macOS; arquivo XDG no Linux | Testes do adaptador e escape de caminho |
| Processos | spawn do streaming retorna antes de confirmar abertura | Aguardar spawn/error | Inspeção do tratamento de processos |

## Qualidade e limites encontrados

- Núcleo usa máquina de estados pura, adaptadores injetáveis e testes de falha, pontos positivos reais.
- index.ts concentra composição, plataforma, IPC e ciclo de vida. Extrair por responsabilidade apenas onde facilitar testes; evitar uma refatoração ampla sem benefício.
- applyBitrate do receptor é um no-op: UI muda valor, mas Moonlight lê bitrate ao iniciar. Qualidade automática ainda precisa métricas e integração real, não só seletor.
- Gateway: corrida entre start/stop e partidas simultâneas reproduzida por testes e corrigida com geração de operação e Promise compartilhada.
- PIN é transmitido por HTTP na LAN e associado ao nome. Aprovação humana continua necessária; isso não é base suficiente para arquivos/clipboard sem canal autenticado.
- Diagnóstico remove home e formatos conhecidos de credenciais. Mensagens arbitrárias, cookies e segredos fora desses formatos ainda exigem revisão; não há garantia de sanitização universal.
- Assinatura oficial, disposição nativa validada no Mac, Deskflow, clipboard e arquivos não estão concluídos. O atualizador implementado tem os limites registrados acima.
- Inventário inicial: 178 arquivos nas áreas src/site/workflows/native. Revisão manual dos caminhos críticos realizada; revisão individual de todos os arquivos ainda em andamento.

## Fontes técnicas consultadas

- [Cofre do Electron e basic_text](https://www.electronjs.org/docs/latest/api/safe-storage).
- [Inicialização nativa Windows/macOS](https://www.electronjs.org/docs/latest/api/app).
- [Autostart XDG](https://specifications.freedesktop.org/autostart/latest/).
- [Escape do Exec em desktop entries](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html).
- [Atualização electron-builder](https://www.electron.build/docs/features/auto-update/).
