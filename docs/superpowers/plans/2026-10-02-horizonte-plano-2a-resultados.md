# Plano 2A: resultados parciais (Tarefa 12 em andamento)

Estado em 02/10/2026. Tarefas 1 a 11 prontas e testadas (337 testes). Branch: `feat/plano-2a-motor-sunshine`.

## Confirmado no Sunshine real (Windows, 2026.914.233613)

- Credencial criada com `sunshine.exe <conf> --creds horizonte <senha>` em PowerShell de administrador, seguido de `Restart-Service SunshineService`.
- `GET /api/pin` e `GET /api/config` respondem 200 em `https://localhost:47990` com Basic auth.
- `GET /api/config` devolve só as chaves definidas, mais `platform`, `status` e `version`. Esses três são metadados: o `getConfig` agora os ignora (teste com mutação), senão o read-merge-write os gravaria no `sunshine.conf`.

## Problema aberto (importante)

`POST /api/restart` deixou o Sunshine travado: o processo continuou vivo, mas parou de escutar na 47990, e o log terminou em "Interrupt handler called" e "Unregistered Sunshine mDNS service". A API não voltou sozinha. Só `Restart-Service SunshineService` como administrador resolve.

O app reinicia o Sunshine em dois lugares: na sondagem do encoder (sem `engine.json` ainda) e quando a configuração muda (por exemplo `sunshine_name`). Por isso a preparação falhou com "O Sunshine não respondeu".

Próximos passos sugeridos:

1. Antes de sondar, ler o log atual: se ele já mostra encoder de hardware com o `amd_usage` de um candidato, lembrar esse candidato sem reiniciar.
2. Só reiniciar quando a configuração realmente mudou, e tratar "não voltou" com uma mensagem que diga para reiniciar o serviço do Sunshine.
3. Rodar de novo os passos de pareamento (PIN) e de sessão da Tarefa 12.

## Interface (feito depois dos primeiros testes na tela)

- Preparação com uma frase única que troca a cada etapa, no lugar da lista.
- Seletor Enviar/Mostrar em pílula com indicador deslizante, que persiste entre telas.
- Animações de entrada e de toque no estilo Apple, desligadas com `prefers-reduced-motion`.
- "Avançado" já aparece aberto nos Ajustes.
- "Copiar diagnóstico" mostra "Copiado" por 2 segundos (e "Não consegui copiar" se falhar).

## O que ainda não faz

O modo com Sunshine real usa `existingInstaller`, que não instala nada: assume o Sunshine e o monitor virtual já instalados. A instalação de verdade (MSI, driver do monitor virtual, UAC) é o Plano 2B.
