# Posição da tela estendida por aparelho

Pedido de 30/10/2026: ajustar de forma fácil e rápida onde fica a tela de cada aparelho já pareado.

## Antes

- Um seletor único, "Esquerda / Acima / Direita", escondido nos Ajustes e igual para todo aparelho.
- No motor próprio do Linux, nem era aplicado: a tela estendida sempre nascia à direita.

## Agora

- **Mapa de arrastar**, o mesmo do modo Mouse (`ScreenMap.svelte`, com a opção `dock={false}`, que tira a faixa de "deixar de fora"). Mostra o monitor deste computador e o do aparelho, cada um no tamanho real. O aparelho pode ficar à esquerda, à direita, acima ou abaixo, e em qualquer ponto ao longo da borda.
  - **Na tela "Conectado":** a mudança vale **na hora**, sem reconectar.
  - **Nos Ajustes:** o botão "Posição" em cada aparelho confiável abre o mesmo mapa e vale na próxima conexão. Até a primeira conexão depois desta versão, o tamanho do aparelho aparece como 1920x1080.
- **Guardado por aparelho, pela impressão digital do certificado** (`settings.screenPlacements`). Quem não tem posição guardada usa o lado padrão antigo (`extendSide`).
- O tamanho da tela de cada aparelho confiável fica guardado e é atualizado a cada conexão.
- **No GNOME:** o auxiliar `horizonte-display` recebe pela entrada padrão pedidos como `place below 0.25` e aplica a disposição pelo `org.gnome.Mutter.DisplayConfig`, como configuração temporária (sem o aviso "manter alterações").
  - Ele identifica o próprio monitor (`Meta-N`) anotando os virtuais que já existiam antes de criá-lo.
  - Testado nos quatro lados, com e sem início.
- **No Windows e no macOS** (motor antigo), nada muda: continua o seletor dos Ajustes.

## Testado

No app, desktop → notebook pelo Wi-Fi: o mapa nos Ajustes e na tela "Conectado" moveu a tela estendida.

Lint, tipos, 976 testes, E2E do motor e E2E do app aberto passando.

## Achado

O Electron do código-fonte não abre por um atalho do GNOME: o `chrome-sandbox` dele não tem a permissão especial, e o Ubuntu recusa. O atalho de teste usa `--no-sandbox`; o `.deb` instala o `chrome-sandbox` certo.
