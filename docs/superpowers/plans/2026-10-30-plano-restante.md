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
