O Horizonte transforma o computador do lado em segunda tela. A identidade segue a mesma ideia: uma tela que continua além da borda, sem nada no caminho. O app tem cara de sistema operacional: fonte do próprio sistema, preto e branco, uma cor de ação (`accent`) e uma cor de marca (`sun`) usada com economia.

## Voz e texto

- Escreva em português do Brasil, falando com a pessoa ("você"), em frases curtas e diretas.
- Nomeie as coisas pelo que a pessoa vê: **Enviar**, **Mostrar**, **Permitir**, **tela estendida**, **aparelho**. Nunca use os nomes do sistema por dentro (motor, sinalização, WebRTC, PipeWire) na interface.
- Um botão diz exatamente o que acontece: "Permitir", "Parar", "Conectar". Evite "OK" e "Continuar".
- Títulos terminam em ponto quando são frases ("Estenda sua tela.") e em interrogação quando perguntam ("Permitir o Notebook?").
- O erro diz o que aconteceu e o que fazer, sem pedir desculpas: "O firewall (ufw) está ligado e não foi liberado. Sem isso, o outro aparelho não consegue se conectar."
- Sem emoji, sem exclamação, sem jargão.

## Logo

O logo é um só: **o sol nascendo sobre o horizonte, e o horizonte passando da borda**. A linha que sai do quadrado é a ideia do produto: a tela que continua.

- **Ícone do app** (`assets/Logos/horizonte-icone.svg`): quadrado arredondado `brand-tile` com canto `radius-app-icon`, contorno interno `brand-edge`, sol `sun` e horizonte `brand-paper`, que corta a borda direita. É o ícone da dock, da barra de tarefas, do instalador, do favicon do site e do cartão de compartilhamento. O menor tamanho é `mark-min` (16px).
- **Marca sem fundo** (`horizonte-marca-escura.svg` em fundos claros, `horizonte-marca-clara.svg` em fundos escuros): use dentro de telas e páginas, ao lado do nome. O horizonte não sai da borda aqui, porque não há borda.
- **Marca de uma cor** (`horizonte-marca-mono.svg`): só onde o sistema pede ícone de uma cor (bandeja do Linux e do macOS) ou na impressão.
- **Com o nome:** marca à esquerda, "Horizonte" em seminegrito (`item` ou maior) à direita, com o nome alinhado ao meio do sol e espaço `space-s` a `space-sm` entre os dois.
- **Respiro:** deixe ao redor do logo, livre, pelo menos a altura do sol.
- **Não faça:**
  - trocar as cores do sol ou do horizonte;
  - pôr o sol sem o horizonte;
  - girar, esticar, contornar ou dar sombra;
  - usar o ícone antigo (semicírculo branco sobre preto);
  - criar outra versão do logo para uma tela só.

## Cor

- **O fundo é sempre `bg`.** Cartões e linhas de lista ficam em `surface`; os trilhos (seletor segmentado, fundo de ícone de aparelho) em `surface-sunken`.
- **Texto:**
  - `ink` para o que importa;
  - `ink-muted` para subtítulos e dicas;
  - `ink-faint` só para o dispensável.
- **O botão principal é `ink` com texto em `bg`** (preto no claro, branco no escuro). O azul `accent` fica para links, foco e seleção: nunca pinte um botão grande de azul.
- **`sun` é a cor da marca, não da interface.** Vale no logo, na capa e em destaques de marca do site. A única exceção é a bolinha de "esperando" (`wait-dot`), que usa o mesmo âmbar de propósito. `sun` nunca é texto.
- **Estados** vêm sempre com a palavra junto:
  - conectado: `ok-bg`, `ok-fg`, `ok-dot`;
  - esperando: `wait-bg`, `wait-fg`, `wait-dot`;
  - erro: `danger-bg`, `danger-fg`.
- **Os dois temas são obrigatórios.** Toda cor sai de um token com valor claro e escuro, e o app e o site seguem o tema do sistema.
- **Contraste mínimo:** 4.5:1 para texto, e 3:1 para texto de 24px ou mais e para bordas de controle. Três valores herdados ficam abaixo disso (`ink-faint` no claro, `wait-fg` no claro e `line`), marcados nas notas de cada token. Não use esses três onde o contraste importa.

## Tipografia

- **A fonte é a do sistema** (`sans`: SF Pro no Mac, Segoe UI Variable no Windows, a fonte padrão no Linux), para o app parecer parte do computador. Números e comandos vão em `mono`.
- **Uma tela tem um título** (`title`, `title-lg` ou `title-md`), um subtítulo (`subtitle`, em `ink-muted`) e no máximo uma dica (`hint`).
- **Os títulos são justos** (entrelinha de 1.05 a 1.12 e espaçamento negativo) e quebram de forma equilibrada. O texto corrido usa `body`.
- **Rótulos de grupo** (`label`) vão em seminegrito, com 0.02em de espaçamento, sem caixa alta.

## Espaço e forma

- **Espaçamentos:**
  - dentro de um grupo: `space-xs` e `space-sm`;
  - entre blocos de uma tela: `space-lg`;
  - entre seções: `space-xl`;
  - margem lateral mínima: `space-md`.
  - Use `gap`, nunca margens soltas.
- **Botões são pílulas:**
  - o canto é metade da altura (`radius-control` em `control-lg`);
  - `control-md` (44px) é o menor alvo de toque.
- **Cartões:**
  - de aparelho e de ajustes usam `radius-card`, fundo `surface` e borda `line-soft`;
  - sombra `shadow-card` só no claro.
- **Pílulas e seletor segmentado** usam `radius-pill`.
- **Sem bordas coloridas na lateral de cartões, sem degradês e sem sombras fortes.**

## Movimento

- A curva é `cubic-bezier(0.32, 0.72, 0, 1)`, em 200 a 320 ms: o seletor segmentado desliza, as telas trocam com um leve deslocamento.
- Respeite `prefers-reduced-motion`: sem deslocamento, só a troca.

## Ícones

- **Os aparelhos têm ícones próprios** (`DeviceIcon`): computador de mesa, notebook, tablet, celular e TV. São traços simples de 1.5px na cor do texto ao redor, sempre ao lado do nome.
- **Sistemas** (Windows, Linux, macOS) e o GitHub só aparecem no site, como marcas monocromáticas.
- **Sem emoji.**

## Onde o logo aparece

| Lugar | Arquivo | Variante |
| --- | --- | --- |
| Dock, barra de tarefas, instalador (Windows, macOS, Linux) | `app/build/icon.png`, `.ico`, `.icns` | ícone do app |
| Janela do app e bandeja do sistema | `app/resources/icon.png` (janela), marca de uma cor (bandeja) | ícone do app / marca mono |
| Telas do app | marca sem fundo ao lado do nome, no topo das telas de começar e escolher | marca escura ou clara, pelo tema |
| Site: favicon, cabeçalho, rodapé, simulador | `site/icon.png` e a marca sem fundo | ícone do app / marca |
| Cartão de compartilhamento | `site/og.png` | ícone do app sobre `bg` escuro |
| Este guia | `assets/Logos/` | todas |

Todas as imagens saem das quatro fontes em `assets/Logos/`, nunca de cópias redesenhadas.
