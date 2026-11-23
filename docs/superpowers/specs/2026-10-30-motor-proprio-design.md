# Motor próprio de transmissão (WebRTC)

Data: 2026-10-30. Substitui a decisão "gerenciador, não fork" do [design original](2026-10-02-horizonte-design.md#decisão-gerenciador-não-fork).

## Por que

O Horizonte nasceu para ser o Spacedesk multiplataforma e bonito: abrir nos dois computadores, um clique, tela estendida. Para chegar lá rápido, ele passou a instalar e coordenar o Sunshine e o Moonlight. Em quatro semanas e 23 betas, a maior parte do trabalho foi contornar esses dois programas, e não construir o Horizonte:

- forks com patches próprios e dois workflows de CI só para compilá-los (`sunshine.yml`, `moonlight.yml`, release `motores-hz1`);
- serviço do sistema, usuário e senha no cofre, API HTTP local, reinício que trava no Windows e leitura do log para descobrir monitor e encoder;
- encoder testado por tentativa e erro (AMF que recusa `lowlatency`);
- pareamento por PIN do Moonlight, canal próprio só para esconder o PIN e conferência com `list` antes de transmitir;
- portas do Sunshine no firewall (Windows e ufw), Smart App Control bloqueando o executável sem assinatura;
- janela do Moonlight fora do controle do app (título, fundo e saída precisaram de patch);
- gateway separado para receber pelo navegador.

O motor novo troca tudo isso por código TypeScript do próprio Horizonte, sobre o WebRTC do Chromium que já vem dentro do Electron.

## Objetivo

Do ponto de vista de quem usa: abrir o Horizonte nos dois computadores, escolher Enviar num e Mostrar no outro, clicar, e a tela estender. Sem instalar mais nada, sem PIN, sem painel, sem firewall para configurar à mão. Se der errado, o erro diz o que fazer.

Do ponto de vista do projeto:

- nenhum programa de terceiros instalado, baixado ou executado para transmitir a tela;
- o motor inteiro coberto por testes que rodam na CI, inclusive uma transmissão real entre dois processos do Electron;
- latência e qualidade medidas por números do próprio motor, e não por impressão.

## O que "sem dependências externas" quer dizer aqui

| Peça | Fica com | Observação |
|---|---|---|
| Captura da tela | Chromium (`desktopCapturer`) | Já vem no Electron |
| Codificação de vídeo (com placa de vídeo quando houver) | Chromium (WebRTC) | Já vem no Electron |
| Transporte, perda de pacote, controle de banda, criptografia | Chromium (WebRTC: ICE, DTLS-SRTP, GCC) | Já vem no Electron |
| Decodificação e exibição | Chromium (`<video>`) | Já vem no Electron |
| Descoberta na rede | `bonjour-service` | Já usado hoje |
| Sinalização e pareamento | Código nosso (`node:net`) | Novo |
| Monitor virtual no macOS | Código nosso (`native/macos`, `CGVirtualDisplay`) | Já existe |
| Monitor virtual no Linux Xorg | `xrandr --setmonitor` (do sistema) | Já existe |
| Monitor virtual no Windows | Virtual Display Driver (MttVDD) | **Exceção mantida**, ver abaixo |
| Mouse e teclado entre PCs (modo Mouse) | Deskflow | Fora deste trabalho, ver Fases |

### A exceção do Windows: o driver do monitor virtual

O Windows só cria um monitor extra por meio de um driver IddCx em modo kernel/UMDF, e só carrega driver assinado. Escrever o nosso driver é possível (o exemplo da Microsoft é aberto). Mas distribuí-lo sem que a pessoa precise confiar num certificado à mão exige a assinatura por atestação da Microsoft. Essa assinatura pede um certificado EV pago e uma conta no Partner Center, e o projeto ainda não tem nenhum dos dois (ver "Assinatura oficial" em [confiabilidade e integração](2026-10-07-confiabilidade-e-integracao.md)).

Decisão: manter o Virtual Display Driver, que já é instalado hoje pelo `platform/windows/setup.ts` (com o certificado autoassinado confirmado pela pessoa em `confirmDriverTrust`). É um driver parado, sem serviço, API ou porta. O que dava problema era o Sunshine em volta dele. Um driver próprio fica registrado como trabalho futuro, condicionado à assinatura.

## Visão geral

```
        ENVIA (servidor)                                    MOSTRA (cliente)
┌────────────────────────────────┐                ┌────────────────────────────────┐
│ processo principal (Node)      │   TCP 47910    │ processo principal (Node)      │
│  • anúncio mDNS _horizonte     │◄──────────────►│  • busca mDNS _horizonte       │
│  • servidor de sinalização     │  sinalização   │  • cliente de sinalização      │
│  • aprovação, confiança        │  (JSON/linha)  │  • confiança                   │
│  • monitor virtual (platform/) │                │                                │
│          │ IPC                 │                │          │ IPC                 │
│          ▼                     │                │          ▼                     │
│ janela de transmissão (oculta) │   UDP (ICE)    │ janela de exibição (tela cheia)│
│  • desktopCapturer(monitor)    │═══════════════►│  • <video> do MediaStream      │
│  • RTCPeerConnection (envia)   │  vídeo SRTP    │  • RTCPeerConnection (recebe)  │
│  • DataChannel "controle"      │◄══════════════►│  • DataChannel "controle"      │
└────────────────────────────────┘                └────────────────────────────────┘
```

- **Processo principal:** orquestra. Descobre, aceita conexões de sinalização, decide se o aparelho é aprovado, cria o monitor virtual e abre ou fecha as janelas do motor. Não toca em vídeo.
- **Janela de transmissão** (só em quem envia): `BrowserWindow` invisível com `backgroundThrottling: false`. Captura o monitor virtual e mantém a `RTCPeerConnection`. Fica num renderer porque o WebRTC só existe lá; o `utilityProcess` não tem.
- **Janela de exibição** (só em quem mostra): `BrowserWindow` em tela cheia na tela escolhida, fundo preto, sem moldura, com o `<video>`. Substitui a janela do Moonlight.
- **Sinalização:** TCP simples entre os processos principais. Ela só existe para trocar a oferta e a resposta do WebRTC, os candidatos e os comandos de sessão. Depois que o vídeo começa, quase nada passa por ela.
- **Mídia:** WebRTC direto entre as duas janelas, na rede local, sem STUN, TURN ou internet.

## Componentes novos

Todos em `app/src/main/engine/webrtc/`, salvo indicação. Cada um tem interface pequena e é testável sem Electron, seguindo o padrão atual (dependências injetadas, `fake.ts` para a interface).

### 1. Identidade do aparelho (`identity.ts`)

Cada instalação do Horizonte tem uma identidade estável:

- `deviceId`: UUID v4 gerado na primeira abertura, gravado junto dos ajustes.
- **Certificado DTLS persistente:** um `RTCCertificate` (ECDSA P-256) gerado com `RTCPeerConnection.generateCertificate` na primeira abertura. Ele é guardado no IndexedDB da janela do motor, que aceita `RTCCertificate` por clonagem estruturada, e reutilizado em toda conexão (`new RTCPeerConnection({ certificates: [cert] })`). Validade: 10 anos. Se o certificado se perder, a identidade muda e os aparelhos confiáveis precisam aprovar de novo, o que é o comportamento correto.
- `fingerprint`: o SHA-256 desse certificado, como aparece no SDP (`a=fingerprint:sha-256 AB:CD:...`). É a identidade que vale para confiança.

O processo principal pede a impressão digital à janela do motor uma vez por execução e a mantém em memória.

### 2. Descoberta (`discovery.ts`, substitui o atual)

Hoje o Horizonte procura `_nvstream._tcp` (anúncio do Sunshine) e anuncia `_horizonte._tcp` só com o tipo de aparelho (`presence.ts`). O novo motor usa apenas `_horizonte._tcp`, com TXT ampliado:

| Chave | Valor | Uso |
|---|---|---|
| `v` | versão do protocolo (`1`) | Recusar versões incompatíveis com uma mensagem clara |
| `id` | `deviceId` | Distinguir dois aparelhos com o mesmo nome |
| `k` | tipo de aparelho (já existe) | Ícone |
| `m` | `send`, `receive`, `mouse` ou vazio | Mostrar na lista só quem está pronto para enviar |
| `p` | porta da sinalização | Conectar sem porta fixa quando a padrão estiver ocupada |
| `fp` | 16 primeiros caracteres hex da impressão digital | Mostrar "confiável" na lista antes de conectar (não substitui a verificação no DTLS) |

- A escolha de endereço entre várias interfaces (`sameNetwork`, WSL, Docker, VirtualBox) continua igual: é código já testado e vem para o novo módulo sem mudanças.
- O anúncio é atualizado (`m`) quando a pessoa muda de modo. Quem está em Mostrar lista apenas `m=send`.
- Aparelhos com `v` diferente aparecem na lista desabilitados, com "Atualize o Horizonte neste aparelho" (ou no outro, conforme qual for mais antigo).
- Anúncios de versões antigas (sem `v`) aparecem como "Horizonte antigo: atualize".
- Também fica a opção **Conectar pelo IP**, que já existe no modo Mouse. Nela, sem anúncio, a sinalização responde com um `hello` que traz os mesmos dados do TXT.

### 3. Sinalização (`signaling.ts`, `protocol.ts`)

**Transporte:** `node:net`, TCP, uma mensagem JSON por linha (`\n`), UTF-8. Porta padrão **47910**. Se estiver ocupada, usa a próxima livre até 47919 e anuncia no TXT `p`. O servidor só escuta enquanto este aparelho está em Enviar.

Por que não WebSocket ou HTTP: o Node não tem servidor de WebSocket embutido, e o protocolo é ponto a ponto, com poucas mensagens. Linhas JSON são suficientes, fáceis de testar e de ler no diagnóstico.

**Limites:** mensagem até 64 KiB (um SDP tem ~5 KiB), no máximo 4 conexões de sinalização simultâneas por servidor e 30 s para o `hello` chegar. Uma linha inválida encerra a conexão. Nunca há eco do conteúdo recebido no log, só o tipo e o tamanho.

**Mensagens (`protocol.ts`, tipos discriminados por `t`, versão 1):**

| De → para | `t` | Campos | Quando |
|---|---|---|---|
| cliente → servidor | `hello` | `v`, `id`, `name`, `kind`, `fp` (completa) | Ao conectar |
| servidor → cliente | `hello` | `v`, `id`, `name`, `kind`, `fp` (completa), `screen` | Resposta |
| servidor → cliente | `pending` | — | A pessoa do outro lado precisa aprovar |
| servidor → cliente | `accepted` | `trusted: boolean` | Aprovado (por clique ou por confiança) |
| servidor → cliente | `denied` | `reason: 'user' \| 'busy' \| 'version'` | Recusado |
| cliente → servidor | `cancel` | — | Desistiu enquanto esperava aprovação |
| cliente → servidor | `want` | `width`, `height`, `fps`, `bitrate`, `codecs: string[]` | Depois de `accepted`: pede a sessão |
| servidor → cliente | `offer` | `sdp` | O servidor sempre oferece (é quem tem a mídia) |
| cliente → servidor | `answer` | `sdp` | Resposta |
| ambos | `ice` | `candidate`, `sdpMid`, `sdpMLineIndex` | Trickle ICE |
| cliente → servidor | `bitrate` | `mbps` | `applyBitrate` do lado que recebe |
| ambos | `bye` | `reason: 'user' \| 'error' \| 'quit'` | Encerramento normal |
| ambos | `ping` / `pong` | `at` | A cada 5 s; 3 perdidos = conexão caiu |

A sessão WebRTC só começa depois de `accepted`. O servidor ignora `want`, `answer` e `ice` de uma conexão que não foi aceita.

**Reconexão:** se a `RTCPeerConnection` cair (`connectionState` `failed`, ou `disconnected` por mais de 5 s) e a sinalização seguir viva, o servidor faz *ICE restart* com uma nova `offer`. Se a sinalização cair, o cliente tenta reconectar até 3 vezes, com espera de 1, 2 e 4 s (a regra atual de [confiabilidade](2026-10-07-confiabilidade-e-integracao.md)). Um aparelho já aceito nesta sessão volta sem pedir aprovação de novo, desde que a impressão digital seja a mesma. `bye` com `reason: 'user'` nunca reconecta.

### 4. Pareamento e confiança (`trust.ts`)

Substitui o PIN do Moonlight, o `pin-channel.ts` e o `PairRequest.pin`.

**Primeira vez:** o cliente conecta, troca `hello` e recebe `pending`. Quem envia vê **"Permitir {nome}?"** com o ícone do aparelho e a caixa "Confiar neste aparelho". Quem mostra vê "Aguardando {nome} permitir". Não há número para digitar ou comparar.

**Proteção contra intermediário:** a confiança não é no nome nem no IP, mas na impressão digital do certificado DTLS.

- O `hello` traz a impressão digital completa de cada lado.
- Ao aplicar a oferta ou resposta remota, cada lado confere que o `a=fingerprint` do SDP é igual à do `hello`. Se for diferente, encerra com erro.
- Como o DTLS do WebRTC só completa se o par tiver a chave privada daquele certificado, quem não tem a chave não consegue fingir ser um aparelho confiável.
- A sinalização em si não é cifrada, e isso é aceitável: ela só carrega SDP e candidatos, nunca vídeo ou credencial. O conteúdo da mídia é sempre cifrado (DTLS-SRTP, obrigatório no WebRTC).

**Aparelho confiável:** `TrustedDevice` passa a ser `{ id, name, fingerprint }`. Um pedido com `id` e `fingerprint` iguais a um confiável é aceito sozinho (`accepted { trusted: true }`). O nome pode mudar sem perder a confiança. O IP deixa de importar: muda com DHCP e era a fonte do bug de aprovação repetida.

**Migração:** entradas antigas `{ name, address }` ficam guardadas. No primeiro pedido que bate em nome **e** endereço, o Horizonte pede aprovação uma última vez, com o texto "O Horizonte foi atualizado. Permita {nome} mais uma vez". Ao aprovar, a entrada antiga é trocada pela nova. Ajustes e Diagnóstico mostram os confiáveis e permitem remover.

**Ocupado:** enquanto há uma sessão ativa, novos pedidos recebem `denied { reason: 'busy' }`, e quem pediu vê "{nome} já está mostrando a tela em outro aparelho". Vários clientes ao mesmo tempo continuam fora do escopo.

### 5. Sessão de mídia: lado que envia (`renderer/engine/sender.ts`)

Roda na janela de transmissão. Recebe comandos do processo principal por IPC (`engine:*`, expostos no preload só para essa janela).

**Captura:**

1. O processo principal informa o `display_id` do monitor virtual (ver Monitor virtual).
2. A janela chama `desktopCapturer.getSources({ types: ['screen'] })` pelo processo principal e escolhe a fonte com `display_id` igual.
3. A captura usa `getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId, maxWidth, maxHeight, maxFrameRate } } })`.
4. Usa `track.contentHint = 'detail'` (texto nítido, prioriza resolução) e muda para `'motion'` só no perfil Máximo a 120 fps.
5. O cursor precisa aparecer no vídeo. O Chromium o desenha por padrão na captura de tela no Windows e no macOS. Confirmar no Linux X11 na Fase 1; se faltar, desenhar a posição do cursor no receptor pelo DataChannel.

Sem áudio. O som fica em quem envia, que é o comportamento atual (`fix/audio-fica-no-emissor`).

**Codificação:**

- **Codec:** `transceiver.setCodecPreferences` com a ordem vinda de `want.codecs`, filtrada pelo que os dois lados suportam (`RTCRtpSender.getCapabilities('video')` / `RTCRtpReceiver.getCapabilities('video')`). Ordem do automático:
  - H.264 com placa de vídeo, quando `MediaCapabilities.encodingInfo` informar `powerEfficient: true`;
  - senão AV1;
  - senão VP9;
  - senão VP8.

  HEVC só entra se as duas pontas listarem, o que hoje é raro no WebRTC do Chromium.
- **Bitrate:** `sender.setParameters` com `encodings[0].maxBitrate = mbps * 1e6`, `maxFramerate = fps`, `scaleResolutionDownBy = 1` e `degradationPreference = 'maintain-resolution'` (texto legível vale mais que quadros num monitor de trabalho). No perfil Máximo a 120 fps vale `'balanced'`.
- **Início rápido:** a sessão começa a 60% do bitrate escolhido e sobe até 100% em 3 s. O controle de congestionamento do WebRTC (GCC) cuida do resto e pode baixar sozinho em Wi-Fi ruim.
- **Placa de vídeo no Linux:** a codificação por VA-API no Chromium depende de flags. O Horizonte liga `AcceleratedVideoEncoder` e `VaapiVideoEncoder` em Linux no `app.commandLine` antes de `ready` e confere pelo `encoderImplementation` do `getStats` se a placa está sendo usada. Se não estiver, segue no processador, sem erro, e o Diagnóstico registra.

**Rede:**

- `iceServers: []`: nada sai da rede local.
- `iceTransportPolicy: 'all'` e `bundlePolicy: 'max-bundle'`.
- Candidatos sem ofuscação mDNS: `app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')`. Sem isso, o Chromium troca o IP local por um nome `.local` que o outro lado nem sempre resolve, principalmente no Windows.
- Faixa de portas UDP fixa, desejada para poder liberar no firewall: **47920–47929**. O Chromium não expõe isso por API da página; a política `WebRtcUdpPortRange` do Chrome não é lida pelo Electron. Na Fase 1, investigar se há switch ou trial que funcione na versão do Electron em uso. Se não houver, a regra de firewall passa a ser por programa e não por porta (ver Firewall).

**DataChannel `controle`** (ordenado e confiável): `stats` do receptor a cada segundo, mudança de tamanho de janela do receptor e, na Fase 5, entrada de mouse e teclado (num segundo canal, não ordenado).

### 6. Sessão de mídia: lado que mostra (`renderer/engine/receiver.ts`, janela de exibição)

- **Janela:** abre na tela onde o Horizonte está (ou na que a pessoa escolher em Ajustes, se houver mais de uma), com `fullscreen: true`, `backgroundColor: '#000'`, `autoHideMenuBar`, sem moldura e `title: 'Horizonte'`.
- **Vídeo:** `<video autoplay muted playsinline>` ocupando a janela, `object-fit: contain`, cursor do sistema escondido sobre o vídeo.
- **Atraso mínimo:** `receiver.jitterBufferTarget = 0` (equivalente moderno do antigo `playoutDelayHint`), ajustado assim que o `track` chega.
- **Sair:**
  - `Esc` segurado por 1 s, para não sair por um toque acidental;
  - ou mover o mouse ao canto superior e clicar no botão "Desconectar", que aparece por 3 s;
  - fechar a janela também encerra, com `bye { reason: 'user' }`.
- **Tela ligada:** `powerSaveBlocker.start('prevent-display-sleep')` enquanto mostra. Em quem envia, `'prevent-app-suspension'`.
- **Painel de números (`Ctrl+Shift+D`):** resolução, fps recebidos, codec e implementação, bitrate, RTT, perda, quadros descartados, atraso do buffer e latência estimada (ver Medição). Os mesmos números entram no Diagnóstico.
- **Ao conectar,** a janela principal do Horizonte vai para os ícones ocultos, como hoje.

### 7. Monitor virtual (`platform/*`)

A interface `VirtualDisplay` perde tudo que era do Sunshine (`isVirtual(SunshineDisplay)`, `config()`, `outputName()`) e passa a ser:

```ts
export interface VirtualDisplay {
  /** Cria (ou confirma) o monitor virtual com este tamanho e devolve o id dele na lista do Electron (`screen.getAllDisplays()`). */
  ensure(size: { width: number; height: number; fps: number }, signal?: AbortSignal): Promise<number>
  /** Desliga o monitor virtual; as janelas que estavam nele voltam para as outras telas. */
  release(): Promise<void>
  place?(side: ExtendSide): Promise<void>
  /** Sem monitor virtual possível aqui: a transmissão espelha a tela principal. */
  readonly mirrorOnly: boolean
}
```

Para achar o monitor, o `ensure` compara `screen.getAllDisplays()` antes e depois de criar. O id novo é o monitor virtual. Isso não depende do nome do driver nem de log.

| Sistema | Como cria | `release` | Observações |
|---|---|---|---|
| Windows | VDD já instalado. O tamanho e a taxa vão no arquivo de configuração do driver (`vdd_settings.xml`; confirmar local e formato na versão fixada em `versions.ts`); o driver é habilitado e desabilitado pelo PnP (`pnputil /enable-device` / `/disable-device`), com uma única elevação por sessão de preparo | Desabilita o dispositivo, para nenhuma janela ficar perdida numa tela invisível depois de desconectar | Reaproveita `driver-script.ts`, `elevation.ts`, `placement.ts`. A recuperação do monitor "sem classe Display" ([beta13](../plans/2026-10-08-beta13-validacao.md)) continua pendente e entra na Fase 2 |
| macOS | `horizonte-display --width W --height H --name Horizonte` (nosso). Lê `DISPLAY_ID` e casa com o `display.id` do Electron (é o mesmo `CGDirectDisplayID`) | Encerra o processo (SIGTERM) | A permissão de Gravação de Tela passa a ser pedida pelo próprio Horizonte, pois é ele quem captura. Texto do pedido a revisar |
| Linux Xorg | `xrandr --setmonitor` (script atual) | `xrandr --delmonitor` | Confirmar na Fase 1 que o Chromium lista o monitor do `--setmonitor` como tela separada. Se não listar, capturar a tela inteira e recortar a região no receptor (`video` com `object-position`) |
| Linux Wayland | Sem monitor virtual: `mirrorOnly = true`, espelha a tela principal pelo portal (o Chromium usa o portal sozinho) | — | Monitor virtual no Wayland exige pedir ao portal uma fonte `VIRTUAL` e entregar o nó do PipeWire ao Chromium, o que o Electron não expõe. Fica para investigação (Fase 6) |

No Wayland, o portal mostra o seletor de tela do sistema na primeira vez. O Horizonte explica isso antes ("O sistema vai perguntar qual tela compartilhar: escolha a principal") e guarda o *restore token* que o Chromium devolve, para não perguntar de novo.

### 8. Firewall

O Horizonte para de abrir as portas 47984–48010 do Sunshine e 47900 do canal de PIN, e passa a precisar de:

- TCP 47910–47919 (sinalização, só em quem envia);
- UDP 47920–47929 (mídia; se a faixa de portas não funcionar no Electron, UDP do executável do Horizonte);
- UDP 5353 (mDNS, já usado hoje).

| Sistema | Como |
|---|---|
| Windows | Uma regra por programa (`Horizonte.exe`, perfil Privado, entrada TCP e UDP), criada na mesma elevação do driver. Sem ela, o Windows mostra o próprio aviso de firewall na primeira escuta, e o Horizonte explica antes: "Clique em Permitir acesso". Redes públicas ficam bloqueadas de propósito |
| Linux | Mesma lógica do ufw atual (`fix(linux): libera as portas do Sunshine no ufw, só para redes privadas`), trocando as portas. firewalld na zona `home`, se ativo |
| macOS | Firewall de aplicativo: o macOS pergunta na primeira escuta. Nada a configurar |

### 9. Implementação do `EnginePort` (`engine/webrtc/engine.ts`)

O núcleo (`controller.ts`, `machine.ts`) e as telas continuam falando com `EnginePort`. O novo `WebRtcEngine` implementa:

| Método | Comportamento |
|---|---|
| `prepare(onStep, settings, onProgress)` | `engine`: abre a janela de transmissão e carrega a identidade (instantâneo). `display`: `VirtualDisplay.ensure` e `place`. `encoder`: lê capacidades (`getCapabilities`, `encodingInfo`) e escolhe a ordem de codecs. Depois começa a escutar a sinalização e anuncia `m=send`. Repetir com os mesmos ajustes não refaz nada |
| `abort()` | Para de escutar, cancela pedidos pendentes (`denied`), libera o monitor virtual se nenhuma sessão começou |
| `approve({ pairingId, trust })` | Envia `accepted`; com `trust`, grava `{ id, name, fingerprint }` |
| `deny(pairingId)` | `denied { reason: 'user' }` |
| `stopSending()` | `bye`, fecha a `RTCPeerConnection`, `release` do monitor, para de escutar |
| `applyBitrate(mbps)` | Envia: `setParameters`. Mostra: manda `bitrate` pela sinalização |
| `placeDisplay(side)` | `VirtualDisplay.place` |
| `listHosts()` | Descoberta (`m=send`, mesma versão) com tipo de aparelho e marca de confiável |
| `connect(host, settings)` | Sinalização → `hello` → espera `accepted` (timeout de 2 min, cancelável) → `want` → abre a janela de exibição → resposta e ICE. Resolve quando o primeiro quadro é exibido (`requestVideoFrameCallback`), e não quando o ICE conecta |
| `disconnect()` | `bye`, fecha a janela de exibição |
| eventos | `onPairRequest` (com `pairingId`, nome, endereço e tipo, sem `pin`), `onPairCancelled`, `onClientConnected` (no primeiro quadro confirmado pelo receptor via DataChannel), `onClientDisconnected`, `onStreamEnded` |

Mudanças de tipos:

- `PairRequest.pin` e `ApproveRequest.pin` saem.
- `AppState.approve.pin` sai, e a tela `Approve.svelte` perde a área do PIN.
- `PrepStep` continua igual. Os textos de progresso mudam: o passo "engine" deixa de baixar 50 MB.
- `TrustedDevice` muda como descrito em Pareamento.
- `Codec` vira `'auto' | 'h264' | 'av1' | 'vp9'`. Ajustes antigos com `hevc` viram `auto`.
- `Encoding` (`gpu`/`cpu`) sai dos Ajustes: o WebRTC não permite forçar placa ou processador de forma confiável. O Diagnóstico mostra qual está em uso.

### 10. Medição (`stats.ts`)

Sem números confiáveis não há como saber se o motor novo é melhor. Cada lado lê `getStats()` a cada segundo:

- **Envia:** `outbound-rtp` (`framesEncoded`, `framesPerSecond`, `totalEncodeTime`, `encoderImplementation`, `qualityLimitationReason`, `targetBitrate`), `candidate-pair` (`currentRoundTripTime`, `availableOutgoingBitrate`).
- **Mostra:** `inbound-rtp` (`framesDecoded`, `framesDropped`, `jitterBufferDelay`/`jitterBufferEmittedCount`, `totalDecodeTime`, `packetsLost`, `decoderImplementation`).
- **Latência ponta a ponta estimada:** negocia a extensão `abs-capture-time` e usa `video.requestVideoFrameCallback`, cujo `metadata.captureTime` vem no relógio de quem envia e o `metadata.receiveTime` no de quem recebe. O desvio entre relógios é corrigido pelo `ping`/`pong` da sinalização (estimativa de NTP simples: menor RTT de 10 amostras). Latência = `expectedDisplayTime − captureTime − desvio`.
- **Medição física (Fase 1):** página de teste com um contador em milissegundos, aberta no monitor virtual, e uma foto das duas telas lado a lado. É o número que vale para comparar com o Moonlight.

Os números ficam num anel de 120 amostras e entram no Diagnóstico como resumo (mediana, p95), nunca como série crua.

### 11. Receber pelo navegador (fase posterior)

Substitui o gateway em `src/main/web/` (baixado à parte hoje). O processo principal de quem envia serve, em HTTP na porta 47911, uma página estática (o mesmo `receiver.ts` empacotado para o navegador). A sinalização vai por HTTP: `POST` para mandar e Server-Sent Events para receber, ambos do `node:http`. O `RTCPeerConnection` funciona em página HTTP sem TLS. O acesso usa o código de 6 dígitos exibido no app (já existe em `WebAccess.code`). Tablets e celulares passam a receber a tela sem instalar nada, como o visualizador HTML5 do Spacedesk.

## O que sai do projeto

Ao fim da Fase 3, nada disso fica no repositório nem no instalador:

- `engines/` inteiro (patches e `build-linux.sh`);
- `.github/workflows/sunshine.yml` e `moonlight.yml`; a release `motores-hz1` fica arquivada, sem uso;
- `app/src/main/engine/sunshine/`, `engine/moonlight/`, `engine/pin-channel.ts`, a parte `_nvstream` de `engine/discovery.ts`;
- `core/encoder.ts` (escolha de encoder do Sunshine);
- em `platform/windows`: download, instalação e serviço do Sunshine, credenciais no cofre (`secrets.ts`) e regras de porta do Sunshine;
- em `platform/linux`: instalação do Sunshine e do Moonlight (`moonlight.ts`, `PORTAL_VIRTUAL_SCRIPT`, Flatpak, `versions.ts` dos motores);
- em `platform/macos`: instalação do Sunshine e do Moonlight (`moonlight.ts`, `versions.ts` dos motores);
- `web/gateway.ts` e `web/wire.ts`: o gateway usa as credenciais e o protocolo do Sunshine, então sai junto com ele. Receber pelo navegador fica indisponível até a Fase 6 (ver Perguntas em aberto);
- textos do README e do site que citam Sunshine e Moonlight. A seção "Como funciona" passa a dizer que o Horizonte transmite sozinho, com WebRTC, e cita só o Virtual Display Driver no Windows.

Fica: o Virtual Display Driver no Windows (instalação, confiança do certificado e posição), o auxiliar Swift do macOS, o `xrandr` do Linux, `bonjour-service`, a lógica de interfaces de rede, o atualizador e o modo Mouse com Deskflow (por enquanto).

## Compatibilidade entre versões

- O motor novo não conversa com Horizontes que ainda usam Sunshine e Moonlight. A versão vira **0.2.0-beta.1**, e a descoberta mostra versões antigas como "atualize".
- O atualizador já existente leva todos para a 0.2. Nas notas da versão: "Atualize os dois computadores".
- Na primeira abertura da 0.2, o Horizonte **não** desinstala Sunshine ou Moonlight sozinho, porque a pessoa pode usá-los para outras coisas. Ele para e desativa o serviço do Sunshine que ele mesmo instalou, se estiver rodando com a configuração do Horizonte, para liberar as portas e a captura. Ajustes ganham "Remover componentes antigos", que leva ao desinstalador de cada um.
- Durante as Fases 1 a 3, os dois motores convivem. A variável `HORIZONTE_ENGINE=webrtc` (ou um ajuste escondido no Diagnóstico) escolhe o novo. O Sunshine só é removido quando a Fase 3 passar nos critérios.

## Fases

Cada fase termina num PR próprio, com testes, CI verde e resultado escrito em `docs/superpowers/plans/` (o padrão `*-resultados.md`).

### Fase 1: prova em dois computadores

Objetivo: responder se o WebRTC do Electron serve antes de investir no resto.

- Módulos `protocol.ts`, `signaling.ts` e `identity.ts` com testes, e `sender.ts`/`receiver.ts` mínimos.
- Comando de desenvolvimento `npm run dev:motor -- --send` e `-- --receive <ip>` que espelha a **tela principal** (sem monitor virtual), sem a interface do app.
- Página de teste de latência e painel de números.

Critérios:

- [ ] Windows → Linux, Linux → Windows e Windows → Windows (ou com o Mac, se disponível) em rede cabeada e em Wi-Fi 5 GHz.
- [ ] 1080p a 60 fps estável por 10 min, com < 1% de quadros descartados no cabo.
- [ ] Latência física (foto) com mediana ≤ 50 ms no cabo e ≤ 80 ms no Wi-Fi. Registrar também o Moonlight atual no mesmo par de máquinas, para comparar.
- [ ] Texto de 12 px legível no receptor, sem borrão perceptível ao rolar uma página.
- [ ] Placa de vídeo em uso (pelo `encoderImplementation`) no Windows e no Mac; no Linux, registrar o resultado.
- [ ] Confirmar: cursor visível, faixa de portas UDP respeitada, candidatos sem `.local`, monitor do `xrandr --setmonitor` listado como tela.

**Se a latência ou a nitidez reprovarem,** parar e reavaliar antes da Fase 2. Alternativa já pensada: captura e codificação nativas (WebCodecs com `VideoEncoder` por hardware sobre um `MediaStreamTrackProcessor`) e transporte próprio por UDP com FEC. Mais código, mesmo princípio de nenhum programa externo.

### Fase 2: monitor virtual

- Nova interface `VirtualDisplay` nos três sistemas, `release` incluído.
- Windows: tamanho pelo `vdd_settings.xml`, habilitar e desabilitar pelo PnP e caso do dispositivo sem classe Display.
- macOS: captura do monitor do auxiliar e pedido de Gravação de Tela pelo Horizonte.
- Linux Xorg com o monitor do `xrandr`; Wayland em espelho, com o aviso do seletor e o *restore token*.

Critério: estender (e não espelhar) nos três sistemas que enviam, com posição esquerda, direita e acima, e nenhuma janela perdida depois de desconectar.

### Fase 3: motor no app

- `WebRtcEngine` implementando `EnginePort`; pareamento por aprovação e confiança por impressão digital; migração dos confiáveis.
- Mudanças de tipos e telas (Approve sem PIN, Ajustes sem codificação e codec novo); reconexão; firewall novo.
- Diagnóstico com os números da sessão.
- E2E na CI (ver Testes).
- Remoção de tudo listado em "O que sai do projeto" e versão 0.2.0-beta.1.

Critério: o fluxo "abrir nos dois → Enviar/Mostrar → clicar → tela estendida" sem nenhum passo além da aprovação na primeira vez (e da elevação única do driver no Windows), em instalação limpa nos três sistemas.

### Fase 4: qualidade e acabamento

- Perfis Econômico, Equilibrado e Máximo mapeados para bitrate, fps e `degradationPreference`, com qualidade automática usando os números reais (já pedida em [confiabilidade](2026-10-07-confiabilidade-e-integracao.md), item 4).
- Escolha da tela de exibição quando o receptor tem várias; HiDPI (monitor virtual em 2× no Mac quando o receptor for Retina).
- Suspensão e retomada dos dois lados; troca de rede no meio da sessão.

### Fase 5: toque, mouse e teclado vindos de quem mostra

Hoje quem mostra só vê. O Spacedesk deixa usar a tela estendida com o mouse e o toque do próprio notebook.

- Segundo DataChannel `entrada` (não ordenado, sem retransmissão para movimento; ordenado para cliques e teclas).
- Coordenadas normalizadas (0 a 1) da área do vídeo.
- Injeção em quem envia: único ponto que precisa de código nativo pequeno, por sistema.
  - Windows: `SendInput`.
  - macOS: `CGEventPost`, no auxiliar Swift já existente; pede a permissão de Acessibilidade.
  - Linux: XTest no Xorg; no Wayland, o portal RemoteDesktop.

  O código fica em `native/`, compilado na CI, sem binários de terceiros.

### Fase 6: navegador, Wayland e modo Mouse

- Receber pelo navegador (seção 11) e remoção do gateway.
- Investigar monitor virtual no Wayland (portal com fonte `VIRTUAL` + PipeWire).
- Avaliar trocar o Deskflow do modo Mouse pelo mesmo canal de entrada da Fase 5, com mDNS e confiança do motor novo.

## Testes

- **Unitários (Vitest, sem Electron):**
  - `protocol.ts`: validação de cada mensagem, limites e versões;
  - `signaling.ts`: com sockets reais em `127.0.0.1`, cobrindo aceitar, recusar, ocupado, cancelamento, timeout do `hello`, linha inválida, mensagem grande e `ping` perdido;
  - `trust.ts`: confiável, migração, impressão digital diferente;
  - `discovery.ts`: TXT, versões e escolha de interface (os testes atuais vêm junto);
  - `engine.ts`: com janela e monitor falsos, no padrão de `fake.ts`.
- **SDP:** testes do conferidor de impressão digital com SDPs reais do Chromium gravados como fixture.
- **E2E na CI (`e2e.yml`, Windows, Linux com Xvfb, macOS):** duas instâncias do Electron na mesma máquina, com `--user-data-dir` diferentes. A que envia usa uma fonte sintética, um `<canvas>` animado com `captureStream(60)` no lugar da tela, ligada por uma flag só de teste. A que mostra se conecta por `127.0.0.1` e confirma:
  - aprovação;
  - pelo menos 120 quadros decodificados;
  - cor de um pixel conhecido do canvas;
  - reconexão após derrubar a sinalização;
  - encerramento limpo dos dois lados.

  Isso é a transmissão real do motor, só sem a captura do sistema.
- **Manual (lista em `docs/superpowers/plans/`):** os critérios das Fases 1 e 2 em hardware real, com fotos de latência anexadas. Como já está escrito em confiabilidade: teste simulado não comprova vídeo em hardware real, e os resultados dizem explicitamente o que foi e o que não foi testado.

## Riscos

| Risco | Efeito | Como tratamos |
|---|---|---|
| Latência do WebRTC acima do aceitável para trabalho | O produto não serve | Medido na Fase 1 antes de qualquer remoção; alternativa WebCodecs + UDP próprio descrita |
| Chromium escolhe codificador por software | CPU alta, fps baixo em notebooks | Ordem de codecs pela `encodingInfo.powerEfficient`; flags VA-API no Linux; Diagnóstico mostra a implementação |
| Texto borrado por quantização | Monitor de trabalho ruim | `contentHint 'detail'`, `maintain-resolution`, bitrate inicial alto na rede local |
| Faixa de portas UDP não respeitada | Firewall por porta não funciona | Regra por programa no Windows; firewall com estado basta para ICE iniciado pelos dois lados |
| `desktopCapturer` não lista o monitor do `xrandr --setmonitor` | Linux só espelha | Captura da tela toda e recorte da região no receptor |
| Wayland sem monitor virtual | Linux Wayland só espelha | Igual a hoje sem o Sunshine do Horizonte; investigação na Fase 6 |
| Perda do certificado persistente (perfil apagado) | Aparelhos confiáveis pedem aprovação de novo | Aceitável; aviso no texto da aprovação |
| Driver VDD continua sendo de terceiros no Windows | Dependência restante | Isolado em `platform/windows`; driver próprio quando houver assinatura |

## Perguntas em aberto

1. Fps padrão: 60 (como hoje) ou 30 no perfil Econômico em Wi-Fi?
2. Receber pelo navegador continua necessário na 0.2, ou pode esperar a Fase 6 (o gateway atual sai junto com o Sunshine na Fase 3)?
3. A Fase 1 tem o Mac disponível, ou fica Windows ↔ Linux e o Mac entra na Fase 2?
