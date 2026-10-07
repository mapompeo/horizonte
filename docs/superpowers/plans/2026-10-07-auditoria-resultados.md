# Auditoria e melhorias em 07/10/2026

Base: b87572a. Revisão em andamento; este documento não declara o pedido inteiro concluído.

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
- Diagnóstico esconde home, mas mensagens arbitrárias de processos ainda precisam revisão de redaction de credenciais e endereços.
- Assinatura oficial, atualização automática, disposição nativa, Deskflow, clipboard e arquivos não estão concluídos nesta etapa.
- Inventário inicial: 178 arquivos nas áreas src/site/workflows/native. Revisão manual dos caminhos críticos realizada; revisão individual de todos os arquivos ainda em andamento.

## Fontes técnicas consultadas

- [Cofre do Electron e basic_text](https://www.electronjs.org/docs/latest/api/safe-storage).
- [Inicialização nativa Windows/macOS](https://www.electronjs.org/docs/latest/api/app).
- [Autostart XDG](https://specifications.freedesktop.org/autostart/latest/).
- [Escape do Exec em desktop entries](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html).
- [Atualização electron-builder](https://www.electron.build/docs/features/auto-update/).
