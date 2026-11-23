# Horizonte: design

Data: 2026-10-02. Licença planejada: GPL-3.0 (código aberto). O nome vem da ideia de estender a tela além da borda do monitor.

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

Wayland automático (o app detecta e orienta), cliente em Linux, Android ou iOS, e macOS (servidor e cliente: planejado para uma versão futura, ver Portabilidade), assinatura de código do instalador, HDR, vários clientes ao mesmo tempo, áudio dedicado.

## Arquitetura

Um app em Electron com TypeScript: processo principal em Node (núcleo) e interface em Svelte (HTML, CSS e TypeScript), empacotados com electron-vite. O vídeo roda no motor existente; o app o instala, configura e controla.

Por que Electron: o Node já está instalado e o projeto inteiro fica numa linguagem só; o Chromium embutido renderiza as telas de forma idêntica no Windows, no Linux e no macOS (o WebKitGTK do Tauri no Linux seria um risco para o visual); o tamanho maior do instalador pesa pouco, porque o app já baixa o motor.

Portabilidade: tudo que depende do sistema fica atrás de interfaces em `src/main/platform/` (`VirtualDisplay`, `EngineInstaller`, `Elevation`, `Autostart`). O macOS entra no futuro como uma implementação a mais de cada uma, sem mexer na máquina de estados nem na interface.

### Decisão: gerenciador, não fork

O Horizonte é um gerenciador que baixa e coordena o Sunshine e o Moonlight, e não um fork deles. A pessoa instala só o Horizonte; na primeira abertura ele baixa o motor numa versão fixa, confere o hash e instala. Motivos: custo de manutenção baixo, as melhorias do motor chegam trocando a versão fixa, e o valor do projeto está na experiência de instalação e uso.

O acesso ao motor fica atrás de um adaptador (interface única para configurar, parear e iniciar o stream). Se um dia for preciso mudar o motor (por exemplo, monitor virtual no Linux), só o adaptador passa a apontar para um fork, e a mudança deve ser proposta primeiro ao projeto original.

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

Interface -> IPC do Electron (ponte `preload`) -> núcleo (máquina de estados) -> peça específica (instalador, monitor virtual, encoder, pareamento, descoberta) -> Sunshine (API local HTTPS) ou Moonlight (processo filho). Eventos fazem o caminho inverso e atualizam a tela.

## Telas e fluxos

Protótipo navegável de 10 telas na direção "Silêncio": instalar; primeira abertura (enviar ou mostrar); enviar preparando; enviar pronto; permitir conexão; mostrar escolher computador; enviar em uso; mostrar em uso; ajustes; erro. O seletor Enviar | Mostrar fica no topo de toda tela principal. Regra: uma ação principal por tela; tudo técnico fica em Ajustes, numa folha lateral, sem abas.

## Linguagem visual: Silêncio

Escolhida pelo usuário após comparar três direções e uma rodada de vidro translúcido, que foi descartada por parecer pior. Princípios:

- Fundo claro quase branco (e escuro de verdade), texto grande com espaçamento apertado, tipografia do sistema (SF Pro no macOS, a fonte de sistema equivalente nos outros).
- Uma ação principal por tela. Botão primário preto em forma de pílula; ações de parar ou sair são contornadas.
- Selo de estado acima do título, com cor semântica (verde conectado, âmbar aguardando).
- Ícones de traço fino, cartões brancos com borda e sombra suaves, controles de 44 px ou mais.
- Ajustes em página própria com "Voltar": três perfis de qualidade, slider personalizado, interruptor e nome do computador; o resto fica em "Avançado", fechado por padrão, com seletores segmentados.
- Grade de 8 px, muito espaço em branco, texto curto em português do Brasil.

Uma tentativa de enxugar ainda mais as telas (sem selos, ícones e legendas) foi descartada pelo usuário: a versão polida é a referência.

O protótipo aprovado (10 telas, mais Ajustes com Avançado aberto e o modo escuro) é a referência visual. Qualquer polimento adicional entra como tarefa do plano.

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
- macOS futuro: exige permissão de gravação de tela, uma solução de monitor virtual própria do sistema e conta de desenvolvedor Apple para assinar e notarizar o instalador (sem isso o Gatekeeper bloqueia).
- Sem assinatura digital o Windows mostra aviso; para código aberto é possível pedir assinatura gratuita depois.
- Licenças: Sunshine, Moonlight e o driver de tela virtual têm licenças próprias; conferir a compatibilidade ao empacotar.

## Decisões tomadas

- Abordagem: gerenciador sobre o motor existente (sem fork do motor na v1).
- Um app com dois modos, trocáveis a um clique.
- Direção visual: "Silêncio", com modos claro e escuro.
- Stack: Electron, TypeScript e Svelte. O Tauri foi considerado e descartado (Rust ausente na máquina, renderização no Linux).
- Plataformas: v1 em Windows 11 e Ubuntu (Xorg); macOS no futuro, por isso o código de sistema fica atrás de interfaces.
- Nome: Horizonte.

## Versão futura: navegador e multiplataforma (enviar e receber)

Meta da última versão do roteiro: o Horizonte funciona em qualquer aparelho, tanto para **enviar** quanto para **receber** a tela, e quem não quiser instalar nada pode **receber pelo navegador**.

- **Receber pelo navegador:** a pessoa abre um endereço no celular, tablet ou computador, aprova o pareamento e a segunda tela aparece, sem instalar app. Exige um cliente web de streaming (WebRTC) falando com o motor, um endereço local seguro (HTTPS com certificado, ou o pareamento por PIN já existente) e a mesma confirmação de quem envia. Prós: zero instalação, serve para iOS e Android sem loja. Contras: mais latência e menos controle de codec que o Moonlight nativo, e a segurança do endereço precisa ser desenhada com cuidado (só rede local, pareamento obrigatório, nada exposto à internet).
- **Multiplataforma:** Windows (v1), Linux (plano 4), macOS (permissão de gravação de tela, monitor virtual próprio e notarização), e depois Android e iOS como clientes. Enviar e receber valem para cada plataforma onde o sistema permitir.
- **Uma instalação por aparelho:** só o Horizonte. Ele baixa o que faltar e se atualiza sozinho (o auto-atualizador do próprio app entra com os instaladores, plano 5).
- **Ordem sugerida:** Windows enviar e receber (planos 2B e 3), Linux (4), instaladores e atualização (5), navegador como receptor (6), macOS, Android e iOS (7).

## Versão futura: compartilhar mouse, teclado, área de transferência e arquivos

Ideia registrada em 05/10/2026, depois de olhar o [CursorHop](https://cursorhop.com/). Ainda não é spec de implementação: vira uma quando a v1 estiver fechada (PIN com aparelho novo, mouse e latência medidos, instalação em máquina limpa).

**O que é:** um segundo modo do Horizonte, ao lado de "Estender a tela". No modo **Compartilhar mouse**, cada computador continua com o próprio sistema e as próprias janelas; o mouse e o teclado passam de um para o outro ao chegar na borda da tela, e a área de transferência e os arquivos atravessam junto. "Estender" serve para ganhar uma tela; "Compartilhar mouse" serve para usar dois computadores como se fossem um.

**Por que vale:** o CursorHop faz isso, mas é pago (US$ 10 a 35), de código fechado e não roda em Linux. O Horizonte faria os dois modos no mesmo app, de graça, aberto e com Linux. Números que o CursorHop destaca e que servem de referência para medir o nosso: cerca de 7 ms de atraso do cursor em rede gigabit e cerca de 70 Mbps na cópia de arquivos.

**Motor:** a mesma estratégia do Sunshine e do Moonlight. O Horizonte não reimplementa o protocolo; ele instala, configura e esconde um motor aberto e maduro.

- **[Deskflow](https://github.com/deskflow/deskflow)** (preferido): o projeto oficial que sucedeu o Synergy. Windows, macOS e Linux; mouse, teclado e área de transferência de texto; conexão criptografada. Licença GPL-2.0, versão 1.27.0 de 01/10/2026, cerca de 29 mil estrelas.
- **[lan-mouse](https://github.com/feschber/lan-mouse)** (alternativa): em Rust, GPL-3.0, mais leve, cerca de 5 mil estrelas.
- O motor roda como programa separado, chamado pelo Horizonte, do mesmo jeito que o Sunshine. Isso mantém a licença GPL-3.0 do Horizonte compatível com a GPL-2.0 do Deskflow; confirmar a forma exata da licença do Deskflow (só 2.0 ou 2.0 "ou posterior") antes de distribuir junto.

**Ordem sugerida:**
1. Mouse, teclado e área de transferência de texto, pelo Deskflow, aproveitando a descoberta e o pareamento que o Horizonte já tem.
2. Área de transferência com imagem e texto formatado, se o motor permitir.
3. Arquivos arrastados de um computador para o outro. O Deskflow quase não faz isso, então é código do Horizonte, sobre o canal da rede local e com o mesmo pareamento.

**Perguntas em aberto:**
- Os dois modos convivem? Decisão de 05/10/2026: a escolha entre "Estender a tela" e "Compartilhar mouse" vai ser um seletor (slider) no app, no mesmo desenho da pílula Enviar/Mostrar. Se os dois podem rodar juntos fica para quando o modo existir.
- Como a pessoa diz onde cada computador está (à esquerda, à direita, em cima) sem uma tela de configuração?
- Tradução de atalhos entre Windows e macOS (Ctrl e Cmd): o motor resolve ou é nosso?
- O que medir e mostrar como número na landing: atraso do cursor e velocidade da cópia de arquivos.

## Referências abertas para aproveitar (avaliadas em 05/10/2026)

**[Deskreen](https://github.com/pavlobu/deskreen)** (AGPL-3.0, cerca de 21 mil estrelas, versão 3.2.16 de 08/07/2026): Electron que transmite a tela por WebRTC para qualquer navegador, com criptografia de ponta a ponta. É o mesmo terreno do nosso "Receber pelo navegador". O que vale trazer como ideia:

- **Conectar por QR code:** o computador que envia mostra um QR code e o celular ou tablet abre a tela apontando a câmera, sem digitar endereço.
- **Compartilhar só uma janela**, além da tela inteira ou da tela estendida.
- **Vários aparelhos vendo ao mesmo tempo** (por exemplo, um tablet e um celular).
- **Criptografia de ponta a ponta sobre o WebRTC**, independente do certificado do endereço local.

O que ele não resolve: para **estender** a tela (e não só espelhar), o Deskreen também depende de um monitor virtual ou de um plugue HDMI dummy. A licença AGPL-3.0 permite juntar com o nosso GPL-3.0, mas as partes copiadas continuariam AGPL; por isso a preferência é usar como referência de ideias, não copiar código.

**[DeskPad](https://github.com/Stengo/DeskPad)** (MIT, cerca de 8 mil estrelas): cria um monitor virtual no macOS usando a API `CGVirtualDisplay` do próprio sistema (privada, a mesma que o BetterDisplay usa). Hoje o Horizonte no Mac pede um plugue dummy ou o BetterDisplay para enviar a tela (mensagem "Este Mac só tem uma tela..."). Um pequeno auxiliar nativo do Horizonte, feito do mesmo jeito que o DeskPad e compilado na CI do macOS, criaria o monitor virtual sozinho e tiraria essa exigência. Risco: é API privada, pode mudar numa atualização do macOS.
