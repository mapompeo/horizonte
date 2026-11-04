# Plano do que falta depois da 0.2.0-beta.2

Data: 2026-10-30. Base: [spec do motor próprio](../specs/2026-10-30-motor-proprio-design.md) e os resultados das fases [1](2026-10-30-motor-fase1.md), [2](2026-10-30-motor-fase2.md) e [3](2026-10-30-motor-fase3.md), e da [posição por aparelho](2026-10-30-posicao-por-aparelho.md).

Cada etapa termina num PR próprio para a `main`, com CI verde nos três sistemas e as notas em `docs/superpowers/plans/`. Etapas com mudança visível para quem usa viram uma beta. Nada é dado como pronto sem teste no app de verdade; teste simulado não comprova vídeo nem entrada em hardware real.

Ordem: primeiro o que confunde quem baixa a beta hoje (A), depois o que mais aproxima o Horizonte do Spacedesk (B), depois qualidade (C). O que depende de outro computador (D e E) entra quando houver máquina para testar. Por último, o que amplia o alcance (F).

---

## A. Acertos rápidos (beta.3)

### A1. Site sem PIN nem Sunshine no Linux

- `site/index.html`:
  - "digite o PIN" passa a ser "permita no outro computador, com um clique";
  - os créditos ("usa Sunshine, Moonlight e Virtual Display Driver") passam a dizer o que vale para cada sistema.
- `site/tests`: conferir que nenhum teste trava os textos antigos. Se travar, atualizar junto.
- Pronto quando: `npm test` do site passa, e a página publicada não fala de PIN.

### A2. Aviso de driver de vídeo faltando (Linux)

- Sem o driver VA-API, a imagem passou de 1 s de atraso no notebook com Intel. Quem usa não tem como adivinhar.
- **Detecção** (`platform/linux/video-driver.ts`, pura e testada):
  - placas de vídeo pelo `/sys/class/drm/card*/device/vendor` (Intel 0x8086, AMD 0x1002);
  - drivers VA-API pelos arquivos em `/usr/lib/x86_64-linux-gnu/dri`, `/usr/lib64/dri`, `/usr/lib/dri` e `/usr/lib/aarch64-linux-gnu/dri`: `iHD_drv_video.so` ou `i965_drv_video.so` para Intel, `radeonsi_drv_video.so` para AMD.
  - Com placa Intel e sem nenhum dos dois drivers Intel, devolve o aviso com o pacote certo por distribuição: `intel-media-va-driver` (Ubuntu e Debian), `intel-media-driver` (Fedora e Arch). Distribuição pelo `/etc/os-release`.
- **Interface:** nova chamada `videoHint()` na API.
  - O aviso aparece como dica discreta nas telas Pronto (quem envia) e Buscar (quem mostra), com o comando para copiar.
  - Some sozinho quando o driver aparece, porque a detecção roda a cada abertura dessas telas.
- Pronto quando: os testes da detecção passam, e no notebook, sem o pacote, o aviso aparece (simulado apontando para uma pasta vazia, já que lá ele está instalado).

### A3. Instalador publicado, de verdade

- Instalar o `.deb` da beta no notebook (`sudo apt install ./Horizonte-….deb`; o `sudo` é da pessoa) e repetir Enviar → Mostrar → Permitir → posição.
- Conferir:
  - o `chrome-sandbox` instalado com a permissão certa (o app abre pelo menu sem `--no-sandbox`);
  - o auxiliar em `resources/horizonte-display`;
  - o firewall pedindo senha uma vez;
  - a atualização automática de uma beta para a próxima.
- Pronto quando: o fluxo inteiro funciona pelo app instalado, e o resultado fica registrado.

---

## B. Fase 5: usar o notebook na tela estendida (beta.4)

Hoje o notebook só mostra. No Spacedesk, o mouse, o teclado e o toque do notebook agem na tela estendida. É a falta mais sentida no uso diário.

### B1. Canal de entrada

- Segundo DataChannel, `entrada`, criado por quem envia na oferta, com dois modos:
  - **movimento** do ponteiro: sem ordem e sem retransmissão (`ordered: false, maxRetransmits: 0`), porque só vale o mais recente;
  - **cliques, teclas e rolagem**: ordenados e confiáveis.
- **Protocolo** (`shared/input.ts`, puro e testado), mensagens binárias pequenas:
  - `move x y` (0–65535, fração da tela estendida);
  - `button idx down|up`;
  - `wheel dx dy`;
  - `key code down|up` (o `KeyboardEvent.code`, independente do layout);
  - `text "…"` (texto já composto, para acentos e IME).
- **Segurança:** quem envia só aceita entrada de uma sessão aprovada. Uma opção nos Ajustes ("Permitir controlar este computador pelo outro aparelho") já vem ligada para aparelhos confiáveis. Teclas de sistema perigosas (Ctrl+Alt+Del, a tecla Super sozinha) são ignoradas.

### B2. Captura em quem mostra

- A janela de exibição:
  - lê `pointermove`, `pointerdown/up`, `wheel`, `keydown/up` e o toque (`pointerType: touch`, com toque longo para o clique direito);
  - converte as coordenadas da área do vídeo (`object-fit: contain`, descontando as faixas pretas) em fração.
- Esc segurado continua sendo "sair", e não é enviado.
- O cursor do sistema some sobre o vídeo (o da imagem já vem desenhado).

### B3. Injeção em quem envia: Linux (GNOME)

- **Caminho escolhido:** a sessão do Mutter que já criamos para o monitor virtual. O `org.gnome.Mutter.RemoteDesktop` cria uma sessão ligada à mesma `ScreenCast` (`CreateSession` do RemoteDesktop e `CreateSession` do ScreenCast com `remote-desktop-session-id`). Ela tem `NotifyPointerMotionAbsolute(stream, x, y)`, `NotifyPointerButton`, `NotifyPointerAxis`, `NotifyKeyboardKeycode` e `NotifyKeyboardKeysym`, sem diálogo, no stream do próprio monitor virtual.
- **Auxiliar:** `horizonte-display --input` passa a criar a sessão de RemoteDesktop e aceita pela entrada padrão `move`, `button`, `wheel`, `key` e `text`, os mesmos do protocolo.
- **Caminho das mensagens:** o DataChannel chega à janela de envio, que repassa ao processo principal (IPC), que escreve no auxiliar. Para não pesar, o movimento é limitado a um por quadro de tela (60 por segundo).
- **Teclado:** `KeyboardEvent.code` vira keycode evdev por uma tabela (`shared/keycodes.ts`, testada). O texto composto vai por keysym.
- Pronto quando: no app, o mouse e o teclado do notebook mexem na tela estendida do desktop, com cliques, arrastar, rolagem, acentos e atalhos (Ctrl+C/V). Medir o atraso do clique até a tela.

### B4. Outros sistemas (junto de D e E)

- Windows: `SendInput`, com um auxiliar pequeno em `native/windows`.
- macOS: `CGEventPost` no `horizonte-display`, com a permissão de Acessibilidade.
- Linux sem GNOME: portal RemoteDesktop (KDE) e XTest (Xorg).

---

## C. Qualidade (beta.5)

### C1. Medir direito

- Medir com cabo e com Wi-Fi, por 10 minutos, com o mesmo conteúdo (vídeo em tela cheia na tela estendida e rolagem de página). Registrar a mediana e o p95 de: fps, captura até a tela, perda e processador nos dois lados.
- **Foto do relógio** (`--motor-clock`) para o atraso de ponta a ponta, comparando com o número do Chromium.

### C2. Perda de pacotes no Wi-Fi

- Ligar a proteção do WebRTC contra perda:
  - RED/ULPFEC no H.264, ou o FlexFEC por field trial;
  - NACK já vem ligado.
- Medir de novo no Wi-Fi: o p95 de atraso precisa cair.

### C3. Qualidade automática

- Os perfis Econômico, Equilibrado e Máximo passam a ajustar bitrate, fps e `degradationPreference` pelos números reais (`qualityLimitationReason`, perda e ida e volta), com histerese. Eles continuam escolhíveis à mão.

### C4. Menos processador em quem envia

- Hoje são ~11% na janela de envio, copiando e convertendo imagens de 8 MB.
- **Primeiro passo:** o auxiliar converte para NV12 (metade do tamanho) com SIMD simples, e o `VideoFrame` sai já em NV12.
- **Depois:** DMA-BUF entre o Mutter, o auxiliar e o Chromium, se o Electron aceitar `VideoFrame` a partir de dmabuf.

### C5. Telas de alta densidade

- Quando a tela de quem mostra tem escala maior que 1 (Retina, notebooks 2x), o monitor virtual nasce com escala 2 no GNOME, para o texto não ficar minúsculo.

---

## D. Windows no motor próprio

Precisa de um computador com Windows para testar (acesso por SSH, como o notebook).

- **Monitor virtual** com o Virtual Display Driver que o app já instala:
  - tamanho pelo `vdd_settings.xml`;
  - liga e desliga pelo PnP com uma elevação por sessão;
  - acha a tela nova pela diferença em `screen.getAllDisplays()`.
- **Captura** pelo `desktopCapturer` com a tela certa (`display_id`), sem seletor no Windows.
- **Posição** pelo `placement.ts` que já existe, estendido para "abaixo" e para o início ao longo da borda.
- **Firewall:** uma regra por programa, no perfil Privado, na mesma elevação do driver.
- **Placa de vídeo:** conferir a codificação pela placa (Media Foundation) e se o defeito de ordem dos quadros-chave aparece. A correção é genérica e vale para todos.
- Pronto quando: Windows ↔ Linux nos dois sentidos, estendendo, no app instalado. Aí o Windows passa a usar o motor próprio por padrão.

## E. macOS no motor próprio

Precisa de um Mac para testar.

- **Monitor virtual** pelo `horizonte-display` (Swift) que já existe.
- **Captura** pelo `desktopCapturer`; a permissão de Gravação de Tela é pedida uma vez.
- **Posição** com `CGConfigureDisplayOrigin` no auxiliar Swift.
- Pronto quando: Mac ↔ Linux nos dois sentidos, no app instalado.

## D+E. Remover o motor antigo

Depois de D e E aprovados:

- sai `engines/`;
- saem os workflows `sunshine.yml` e `moonlight.yml`;
- saem `engine/sunshine`, `engine/moonlight` e `pin-channel`;
- saem as instalações dos dois em `platform/*`;
- sai o gateway do navegador;
- saem o PIN do núcleo e da tela e o `HORIZONTE_ENGINE=sunshine`.

O README e o site passam a falar só do motor próprio. Isso vira a 0.3.

---

## F. Alcance

### F1. Linux sem GNOME

- **Xorg:** monitor virtual por `xrandr --setmonitor` (o script já existe) e captura da região. A posição vai no próprio `--setmonitor`.
- **KDE Plasma (Wayland):** portal ScreenCast com fonte `VIRTUAL` (o KDE cria o monitor). Mostra diálogo uma vez; guardar o `restore_token` com persistência.
- Precisa de uma máquina ou VM com cada ambiente.

### F2. Receber pelo navegador

- Quem envia serve, pela porta 47911, a página do receptor (o mesmo `receiver.ts`).
- A sinalização vai por HTTP (POST e Server-Sent Events, só com o `node:http`). O acesso é por um código de 6 dígitos mostrado no app.
- Tablets e celulares recebem a tela sem instalar nada.
- Testar com o celular e o tablet na mesma rede.

### F3. Modo Mouse sem Deskflow

- O modo Mouse passa a usar o canal de entrada do B, sem vídeo: descoberta, confiança e posição do motor próprio. O Deskflow sai junto com o motor antigo.

---

## Andamento

- **A1 feito.**
  - O site explica que no Linux basta permitir, e que o PIN ainda pode aparecer no Windows e no Mac.
  - Os créditos dizem o que vale para cada sistema.
  - O E2E do site confere as duas coisas.
- **A2 feito.**
  - `platform/linux/video-driver.ts`, com testes, e o aviso nas telas Pronto e Buscar, com o comando certo para a distribuição.
  - Conferido no app: com a pasta de drivers vazia (`HORIZONTE_DRI_DIRS`), aparece o aviso da AMD com `sudo apt install -y mesa-va-drivers`; com os drivers, nada aparece.
- **A3:** depende de instalar o `.deb` no notebook, o que pede o `sudo` da pessoa.
- **C3 feito (falta conferir no Wi-Fi de verdade).**
  - `motor/adapt.ts`, com testes: o perfil é o teto; com perda de 2% ou mais, ou ida e volta subindo (fila), por 2 s seguidos, baixa 20% até um quarto do teto; no mínimo e ainda ruim, cai para 30 fps. Com 5 s de rede boa, sobe 10% de cada vez e recupera os quadros por último. Processador no limite por 3 s também cai para 30 fps.
  - Começa depois da subida inicial de 3 s; mudar o perfil à mão vira o novo teto na hora.
  - Conferido em rede local limpa (40 s, 60 fps): nenhuma mudança à toa. Falta medir num Wi-Fi ruim.
- **C4 adiado:** a medição precisa do monitor virtual do GNOME, que não abre com a tela bloqueada. O relógio do teste (`--motor-clock`) agora abre na tela estendida quando o teste estende, para ter imagem mudando durante a medição.
- **F2 feito.**
  - `main/web/browser.ts`: a página do receptor na porta 47920 (fora da faixa da sinalização, 47910 a 47919), ligada à sinalização deste aparelho por HTTP (`/api/abrir` com o código de 6 dígitos, `/api/eventos` em Server-Sent Events, `/api/enviar`). Cinco códigos errados travam por um minuto; só passam mensagens que o `parseMessage` aceita; a página só serve `web.html` e `assets/`.
  - `renderer/web.html` e `src/web/main.ts`: o tablet manda o `hello`, espera o Permitir, pede a tela no tamanho dele e usa o mesmo receptor do app (com toque e teclado). Confere a impressão digital da oferta contra o `hello` do computador.
  - No app, o botão "Receber pelo navegador" da tela Pronto mostra o endereço e o código também no motor próprio.
  - `e2e/web.mjs` (dentro de `npm run e2e:motor`): um Chromium escondido digita o código e confere o vídeo. Falta testar com um tablet e um celular de verdade.
  - O `e2e/web.mjs` fica pulado no Windows: lá o envio ainda é do motor antigo, e o app de teste do tablet (`e2e/web-check`) não chegou a abrir na CI (nem o registro em arquivo apareceu). Voltar a ligar junto com o item D.
- **C2 ligado (falta medir no Wi-Fi).**
  - FlexFEC pelo field trial (`WebRTC-FlexFEC-03` e `-Advertised`) nos dois lados do app; com um navegador (F2), segue sem. O ULPFEC não vale para H.264 no Chromium.
  - Os números de quem mostra passam a ter `fecPackets` (pacotes de correção recebidos), e o teste do motor mostra "correção N pacotes" quando há.
  - Conferido: o `flexfec-03` aparece nas capacidades e a sessão em rede local segue a 60 fps; sem perda, nenhum pacote de correção (o WebRTC só manda quando o outro lado relata perda). Falta medir o p95 de atraso num Wi-Fi ruim, junto do C1.
- **C4 medido e descartado (por ora).**
  - Conversão para NV12 no auxiliar (laços que o compilador vetoriza, BT.709 em faixa limitada), com o `VideoFrame` já em NV12: o socket cai de 314 para 137 MB/s, mas o auxiliar sobe de 20% para 43% de um núcleo.
  - No app de verdade (Começar → Enviar → Receber pelo navegador, com o mouse mexendo na tela estendida a 60 Hz), duas rodadas de cada: antes 180% e 188% de um núcleo para 37,1 e 39,8 quadros/s (4,86 e 4,72 por quadro); depois 165% e 158% para 35,5 e 34,8 quadros/s (4,65 e 4,55 por quadro). Uns 4% por quadro, com menos quadros chegando: não compensa.
  - O caminho que vale testar depois é o DMA-BUF (sem cópia nenhuma). Para medir, o jeito que funcionou foi o app de verdade com a página do navegador num Chromium escondido mexendo o mouse (o relógio do teste não abre na tela estendida no Wayland).
- **C5 feito.**
  - Quem mostra manda a densidade da tela no `want` (`scale`, de 1 a 4; o app pelo `scaleFactor`, a página do navegador pelo `devicePixelRatio`). O auxiliar recebe `--scale` e, ao posicionar a tela, usa a escala mais perto entre as que o GNOME aceita no modo dela.
  - Conferido no GNOME daqui: 2560x1600 com `--scale 2` nasce como `Meta-0` em escala 2.0, à direita do monitor principal e centrada (1280x800 lógicos).
- **Teste de verdade no notebook (2026-11-04), sem `sudo`:** AppImage extraído no notebook (`--appimage-extract`, sem FUSE lá), desktop com o app instalado.
  - O notebook achou o desktop sozinho, Estender → Permitir no desktop → "Tela estendida" nos dois. Vídeo a 1920x1080, ~29 fps, sem perda; captura até a tela com mediana de 107 ms e p95 de 1,1 s.
  - O C5 agiu de verdade: o notebook tem escala 1,25, e o auxiliar recebeu `--scale 1.25`.
  - **Defeito achado e corrigido:** com a escala, o mouse do notebook caía 25% além do ponto (o Mutter conta a posição em pixels lógicos). Conferido pela imagem que chega: pedindo 15% e 85%, o cursor fica em 15% e 86%.
  - Falta: o p95 de atraso (1,1 s) e o teste com teclado numa janela de verdade (não digitei nada para não mexer nas janelas abertas).
- **Atraso de 1 s explicado: economia de energia do Wi-Fi.** No notebook (Intel, 5 GHz, -47 dBm) ela estava ligada. Com o mouse mexendo por 30 s: ligada, mediana 374 ms, p95 471 ms, 767 quadros e 696 pacotes perdidos; desligada (`iw dev … set power_save off`), mediana 131 ms, p95 147 ms, 1496 quadros e nenhuma perda nova. O app agora avisa nas telas Pronto e Buscar quando algum Wi-Fi conectado está economizando, com o comando que desliga de vez pelo NetworkManager (`platform/linux/wifi-power.ts`).
- **Teclado e clique pelo notebook conferidos (2026-11-04):** num editor de texto aberto na tela estendida, o texto digitado no notebook aparece no desktop. Dois defeitos achados e corrigidos no caminho:
  - **A última mudança da tela demorava ~1 s:** o GNOME manda o quadro na hora (marcado no auxiliar), mas (1) o auxiliar descartava o quadro que chegava durante um envio e (2) a janela de envio descartava o que chegava com o anterior ainda na fila, e o codificador ainda pode largar o último de uma rajada. Agora o auxiliar guarda o mais recente para depois do envio, a janela de envio deixa o mais recente esperando a vez e reentrega o último 100 ms depois que a tela para. Medido: a letra aparece em ~0,5 s (antes, 1 a 1,3 s).
  - **A página do navegador não abria:** a porta 47920 estava sendo usada pelo Spotify como porta de saída (fica na faixa que o Linux sorteia para isso). Agora ela tenta de 47920 a 47929 e o app mostra a que pegou.
- **Atualização automática (2026-11-04):** cada mudança do app que entra na main vira uma versão nova (`0.2.0-beta.N`, o número logo acima do maior publicado; `.github/scripts/next-version.mjs`), com os instaladores dos três sistemas anexados a um rascunho e publicada só no fim (`ci.yml`). O app confere ao abrir e a cada 4 horas, baixa sozinho e avisa por notificação; agora também no `.deb` (o electron-updater instala com `pkexec`, que pede a senha numa janela).
- **Atraso com vídeo (2026-11-04):** com um vídeo na tela estendida, o notebook mostrava tudo ~0,5 s atrasado, com a rede ótima (3 ms de ida e volta, nenhuma perda). Era o buffer do receptor do WebRTC: 290 a 650 ms, porque os quadros de tela variam muito de tamanho e o estimador de variação calcula uma espera grande. `jitterBufferTarget = 0` só zera o mínimo; com `WebRTC-ForcePlayoutDelay/min_ms:0,max_ms:0/` o buffer caiu para 1 a 3 ms no mesmo vídeo. A codificação já era pela placa (o motor de codificação da RX 580 estava em uso).
- **Cursor sem atraso (2026-11-04):** o cursor vinha desenhado no vídeo e andava com o atraso inteiro da imagem (captura, codificação, rede, decodificação). Agora, quando quem mostra suporta (`want.cursor`), o auxiliar pede ao GNOME o cursor à parte (`cursor-mode` 2, metadados `SPA_META_Cursor`), manda posição e desenho pelo socket ("HZC1"), quem envia repassa por dois canais (`cursor` sem reenvio, `cursor-shape` confiável) e quem mostra desenha por cima do vídeo. Medido no notebook, de mexer o mouse até o cursor andar: 20 ms; o primeiro quadro de vídeo depois do movimento levava 85 ms. Também: os quadros vão para três áreas reaproveitadas, lidas direto do socket (no teste, ~200% → ~120% de CPU e todos os 60 quadros entregues).
- **Várias telas ao mesmo tempo (2026-11-04):** até quatro aparelhos, cada um com o seu monitor virtual (um auxiliar e um socket de imagens por aparelho, `framesSocket(index)`), a sua janela de envio e a sua entrada. Um pedido durante a conexão pergunta sem derrubar quem já está vendo. Posição: a própria de cada aparelho (`screenPlacements`, pela impressão digital) ou a padrão (`screenPlacement`); quem não tem posição vai para o primeiro lado livre (`shared/placement.ts`). No auxiliar, cada monitor se posiciona em relação às telas físicas e empurra para fora se já há outro do mesmo lado; um monitor que ficaria solto é encostado (o GNOME recusa a disposição inteira com "Logical monitors not adjacent"). Um monitor novo faz o GNOME refazer a disposição, então o motor reposiciona todos na hora e de novo 1,5 s depois. Testado com o notebook e uma página de navegador juntos: notebook embaixo, a outra à direita, e parar uma deixa a outra no lugar.
- **iPhone:** a tela estendida tem o tamanho da área visível da página (sem faixas pretas) e escala que deixa pelo menos 720 pontos de altura (com escala 2, a tela tinha ~390 pontos e as janelas não maximizavam). Adicionada à Tela de Início, a página abre como app, sem as barras do Safari (manifesto e metas da Apple).

