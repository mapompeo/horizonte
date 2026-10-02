# Tela Extra: design

Nome provisório. Data: 2026-10-02. Licença planejada: GPL-3.0 (código aberto).

## Objetivo

Um app de segunda tela sem fio, com instalação de poucos cliques e sem configuração manual, que usa um motor de streaming já maduro (Sunshine e Moonlight) por baixo e oferece uma interface limpa, no estilo Apple, para instalar, parear e usar no dia a dia. Serve ao uso pessoal e ao portfólio.

Quem usa: uma pessoa com dois computadores (um principal, um que recebe a tela extra) que hoje usa o Spacedesk e quer algo multiplataforma, sem montar tudo à mão.

Sucesso: do download até a tela estendida funcionando, sem abrir painel web, sem editar arquivos, sem digitar PIN, com no máximo uma confirmação de administrador por computador. Trocar entre enviar e mostrar custa um clique.

## Contexto e aprendizados

O motor foi validado à mão em 02/10/2026 (Windows, Sunshine 2026.914 e Moonlight 6.1, RX 580). Os pontos que custaram tempo viram requisitos do app:

- O Windows (Smart App Control) bloqueia o Sunshine por não ter assinatura. O app deve detectar e explicar, nunca contornar.
- Reiniciar o serviço do Sunshine e instalar o driver de tela virtual exigem administrador.
- Sem monitor virtual o Sunshine só espelha a tela principal. É preciso um monitor virtual estendido e apontar o Sunshine para o ID dele (`output_name`).
- O encoder AMF da RX 580 recusa `usage = lowlatency` e `ultralowlatency`, mas aceita `lowlatency_high_quality` e `transcoding`. O app deve testar em ordem e cair para software.
- O bitrate padrão negociado ficou em 7 Mbps, baixo demais. O app deve começar em 30 Mbps.
- O pareamento só aparece no Sunshine depois que o cliente fala com ele; o erro 409 do Moonlight apareceu quando o teste de rede foi feito na máquina errada.

## Escopo da versão 1

- Servidor (enviar) em Windows 11 e Linux (Ubuntu com Xorg).
- Cliente (mostrar) em Windows 11.
- Um instalador por sistema; um app com dois modos e um seletor Enviar | Mostrar a um clique.
- Ajustes de bitrate, resolução, quadros por segundo, codec, codificação (placa de vídeo ou processador) e abrir com o sistema.

## Fora do escopo da v1

Wayland automático (o app detecta e orienta), cliente em Linux, macOS, Android ou iOS, assinatura de código do instalador, HDR, vários clientes ao mesmo tempo, áudio dedicado.

## Arquitetura

Um app em Tauri 2: núcleo em Rust, interface em web (HTML, CSS e TypeScript). O vídeo roda no motor existente; o app o instala, configura e controla.

### Núcleo

- **Máquina de estados** única que decide a tela: `Instalando`, `Preparando`, `Pronto`, `Conectado`, `Erro`. Cada modo usa o seu subconjunto. Alternar o modo reinicia a máquina no estado inicial do outro modo.
- **Registro e diagnóstico:** logs locais sem senhas; "Copiar diagnóstico" reúne versão, sistema, GPU, estado e últimos erros.

### Lado enviar

- **Instalador do motor:** baixa uma versão fixa do Sunshine, confere o hash e instala. Gera usuário e senha aleatórios guardados no cofre do sistema. A pessoa nunca vê o painel do Sunshine.
- **Monitor virtual** (interface única, duas implementações):
  - Windows: instala o Virtual Display Driver, define 1920x1080 a 60 Hz, lê o `device_id` e grava `output_name`.
  - Linux (Xorg): cria o monitor com `xrandr --setmonitor` (ou driver dummy) e aponta o Sunshine para ele.
  - Wayland: detecta, avisa e orienta a trocar para Xorg ou usar um plugue HDMI dummy.
- **Teste de encoder:** tenta H.264 por GPU com `usage` em ordem (`lowlatency_high_quality`, `transcoding`) e cai para o processador. Grava o primeiro que abrir.
- **Pareamento sem PIN:** o cliente gera o PIN e o envia por um canal próprio ao servidor; o servidor mostra "Permitir o Notebook?" e só então chama a API do Sunshine. O servidor só aceita pedidos enquanto está na tela de espera e nunca sem clique. Um Moonlight de terceiros continua pareando pelo PIN manual.

### Lado mostrar

- **Descoberta** dos computadores na rede (mDNS, serviço do Sunshine).
- **Motor do Moonlight** embutido (Moonlight Qt). Os ajustes viram parâmetros da linha de comando ou do arquivo de configuração dele.

### Fluxo de dados

Interface -> comandos Tauri -> núcleo (máquina de estados) -> peça específica (instalador, monitor virtual, encoder, pareamento, descoberta) -> Sunshine (API local HTTPS) ou Moonlight (processo filho). Eventos fazem o caminho inverso e atualizam a tela.

## Telas e fluxos

Protótipo navegável de 10 telas na direção "Silêncio": instalar; primeira abertura (enviar ou mostrar); enviar preparando; enviar pronto; permitir conexão; mostrar escolher computador; enviar em uso; mostrar em uso; ajustes; erro. O seletor Enviar | Mostrar fica no topo de toda tela principal. Regra: uma ação principal por tela; tudo técnico fica em Ajustes, numa folha lateral, sem abas.

## Linguagem visual (estilo Apple)

Requisito do usuário: parecer de fato um produto da Apple, não apenas minimalista. Princípios:

- Tipografia do sistema (SF Pro no macOS, a fonte de sistema equivalente no Windows e no Linux), títulos grandes com tracking negativo, poucos pesos.
- Materiais translúcidos com desfoque de fundo nas barras e folhas; profundidade sutil em camadas, sombras suaves e longas.
- Cantos contínuos (squircle), raios generosos e consistentes; controles de 44 px ou mais.
- Ícones de traço fino no estilo SF Symbols; ícone do app em quadrado arredondado com profundidade.
- Cores semânticas (acento do sistema, verde de sucesso, vermelho de erro), com modo claro e escuro de verdade.
- Movimento com mola, transições curtas entre telas, sem efeitos gratuitos.
- Grade de 8 px, muito espaço em branco, texto curto, em português do Brasil.

A fidelidade alta dessas telas é a primeira tarefa do plano de implementação.

## Tratamento de erros

Cada peça devolve um erro tipado com uma mensagem de uma frase e uma ação que resolve (Tentar de novo, Abrir ajuda). Nada de códigos à vista. Casos conhecidos: permissão de administrador recusada, Smart App Control bloqueando o motor, driver de tela virtual sem sucesso, nenhum encoder de GPU aceito (cai para processador sem erro), computador remoto fora da rede, pareamento recusado.

## Testes

- Unitários: máquina de estados; escolha do encoder (ordem e queda para software); geração da linha de comando do Moonlight.
- Integração: um Sunshine falso (servidor de teste da API) cobre instalação, pareamento e mudança de configuração.
- Mutação: cada regra de decisão importante é provada quebrando-a e vendo o teste falhar.
- Manual: matriz Windows 11 e Ubuntu com Xorg, servidor e cliente, incluindo reinício do computador.

## Riscos e questões abertas

- A API do Sunshine pode mudar entre versões; mitigação: versão fixa e teste contra o servidor falso.
- O Moonlight Qt pode não aceitar todos os ajustes por linha de comando; verificar antes do plano.
- Monitor virtual no Linux Wayland é difícil; adiado.
- Sem assinatura digital o Windows mostra aviso; para código aberto é possível pedir assinatura gratuita depois.
- Nome definitivo do produto ainda não escolhido.
- Licenças: Sunshine, Moonlight e o driver de tela virtual têm licenças próprias; conferir a compatibilidade ao empacotar.

## Decisões tomadas

- Abordagem: interfaces finas sobre o motor existente (sem fork do motor na v1).
- Um app com dois modos, trocáveis a um clique.
- Direção visual: "Silêncio", com modos claro e escuro, evoluída para fidelidade Apple.
- Stack: Tauri 2.
