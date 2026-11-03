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

O logo é um só: o sol nascendo sobre o horizonte, o sinal sem fio se espalhando em ondas, e o horizonte embaixo.

- **Preto e branco, como a Apple:** o ícone é um quadrado preto com o desenho branco, centrado. A marca sem fundo é preta em fundos claros e branca em fundos escuros. Sem cor no logo.
- **Ícone do app** (`horizonte-icone.svg`): dock, barra de tarefas, instalador e favicon.
- **Marca sem fundo** (`horizonte-marca-escura.svg` em fundos claros, `horizonte-marca-clara.svg` em fundos escuros): ao lado do nome, no site e no topo das telas de começar.
- **Marca de uma cor** (`horizonte-marca-mono.svg`): bandeja do sistema.
- **Não troque cores, não separe o sol do horizonte e não crie variações.**

## Cor

- **Fundo e texto:** fundo `background`, grupos e cartões em `surface`, texto em `label` e `label-secondary`.
- **`accent` (azul do sistema) é a única cor de ação:** botão principal, links, seleção e foco.
- **`green` e `red` só indicam estado** (conectado e erro); esperando usa `label-secondary`. Sempre com a palavra junto.
- **Os dois temas seguem o sistema.** Não há outra cor.

## Tipografia

- A fonte é a do sistema (`sans`: SF Pro no Mac, Segoe UI no Windows, a padrão no Linux).
- **Três tamanhos só:**
  - `title` (28px) para o título da tela e de pedidos;
  - `body` (17px) para o resto, com nomes e botões em seminegrito;
  - `footnote` (13px) para dicas, rótulos e o seletor.
- **Três pesos:** 400, 600 e 700 (só no título).
- Nada de caixa alta nem espaçamento entre letras feito à mão: a fonte do sistema já ajusta.

## Espaço e forma

- **Grade de 8 pt:** `space-1` a `space-5` (4, 8, 16, 24 e 32px).
- **Altura mínima de toque:** `target` (44px). O seletor mede `segmented` (32px) e chega a 44 de toque.
- **Margem de 16 em tudo:** linhas, cartões, rótulos de grupo e o recuo das divisórias usam `space-3`.
- **Tudo em pílula:** botões, campos, seletor, linhas, estados e ícones usam `radius-capsule`.
- **Só o que é alto demais para pílula** (grupos de várias linhas e cartões) usa `radius-group` (28px).
- **Sem sombras, degradês nem bordas coloridas.** Grupos se separam pelo fundo `surface` sobre `background`, como nos Ajustes.

## Janela

- **O topo é a barra de título:** uma faixa de `titlebar` (64px) com o fundo `background`, igual ao resto da janela.
- **macOS:** os três botões nativos ficam à esquerda, dentro da faixa; o conteúdo do topo começa depois deles.
- **Windows e Linux:** os botões da janela ficam à direita, com o mesmo fundo e símbolos em `label`.
- **Nada passa por baixo dos botões:** o topo fica preso e o conteúdo rola abaixo dele.

## Movimento

- Curto e com propósito: o seletor desliza e as telas trocam. Respeite "reduzir movimento" do sistema.
