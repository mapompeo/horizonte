O Horizonte segue as Human Interface Guidelines da Apple: clareza, deferência e consistência. A interface some para a tela estendida aparecer. Pouca cor, uma fonte, poucos tamanhos.

## Princípios

- **Clareza:** cada tela tem um título, uma frase e uma ação principal.
- **Deferência:** fundo neutro, nada decorativo. O conteúdo e o estado vêm antes da interface.
- **Consistência:** só as cores, os tamanhos e os componentes deste guia. Na dúvida, faça como os Ajustes do macOS e do iOS.

## Texto

- Português do Brasil, falando com a pessoa, em frases curtas.
- O botão diz o que faz: "Permitir", "Conectar", "Parar". Nunca "OK".
- O erro diz o que aconteceu e o que fazer, sem desculpas.
- Sem emoji, sem exclamação, sem termos técnicos (motor, WebRTC) na interface.

## Logo

O logo é um só: o sol nascendo sobre o horizonte, e o horizonte passando da borda.

- **Ícone do app** (`horizonte-icone.svg`): dock, barra de tarefas, instalador e favicon.
- **Marca sem fundo** (`horizonte-marca-escura.svg` em fundos claros, `horizonte-marca-clara.svg` em fundos escuros): ao lado do nome, no site e no topo das telas de começar.
- **Marca de uma cor** (`horizonte-marca-mono.svg`): bandeja do sistema.
- **Cores fixas:**
  - o sol usa o `orange` do sistema;
  - o horizonte é branco no ícone e na marca clara, e quase preto na marca escura;
  - o quadrado do ícone é o quase preto da Apple (#1C1C1E).
- **Não troque cores, não separe o sol do horizonte e não crie variações.**

## Cor

- **Fundo e texto:** fundo `background`, grupos e cartões em `surface`, texto em `label` e `label-secondary`.
- **`accent` (azul do sistema) é a única cor de ação:** botão principal, links, seleção e foco.
- **`green`, `orange` e `red` só indicam estado** (conectado, esperando, erro), sempre com a palavra junto.
- **Os dois temas seguem o sistema.** Não há outra cor.

## Tipografia

- A fonte é a do sistema (`sans`: SF Pro no Mac, Segoe UI no Windows, a padrão no Linux).
- **Cinco tamanhos, da escala da Apple:**
  - `large-title` para o título da tela;
  - `title` para pedidos e seções;
  - `headline` para nomes e botões;
  - `body` para o resto;
  - `footnote` para dicas e rótulos.
- Nada de caixa alta nem espaçamento entre letras feito à mão: a fonte do sistema já ajusta.

## Espaço e forma

- **Grade de 8 pt:** `space-1` a `space-5` (4, 8, 16, 24 e 32px).
- **Altura mínima de toque:** `target` (44px).
- **Tudo em pílula:** botões, campos, seletor, linhas, estados e ícones usam `radius-capsule`.
- **Só o que é alto demais para pílula** (grupos de várias linhas e cartões) usa `radius-group` (28px).
- **Sem sombras, degradês nem bordas coloridas.** Grupos se separam pelo fundo `surface` sobre `background`, como nos Ajustes.

## Movimento

- Curto e com propósito: o seletor desliza e as telas trocam. Respeite "reduzir movimento" do sistema.
