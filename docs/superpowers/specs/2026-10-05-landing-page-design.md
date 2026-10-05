# Horizonte: landing page

Data: 2026-10-05. Aprovada em conversa com a pessoa dona do projeto antes de ser escrita. Revisada no mesmo dia depois da prévia visual aprovada (https://claude.ai/artifact/WYi7Uzus5YphkZtmuaH3vk, versão 3), que virou a referência de visual e de movimento. Esta spec é só a página de descoberta; o app não muda.

## Objetivo

Uma página única para que quem nunca ouviu falar do Horizonte entenda em 10 segundos o que ele é, veja funcionando e consiga baixar ou favoritar o projeto no GitHub. O projeto é de código aberto (GPL-3.0); a página existe para ele ser encontrado, não para vender nem para contar a história de como foi feito.

Quem visita: uma pessoa com dois computadores que quer uma segunda tela sem fio e sem montar Sunshine e Moonlight à mão, ou alguém que achou o projeto no GitHub.

Sucesso:

- Em até 10 segundos a pessoa sabe o que é e para quê serve.
- Do topo da página ao instalador baixado são no máximo dois cliques.
- A página carrega em menos de 1 segundo numa conexão comum e a nota do Lighthouse fica em 95 ou mais em desempenho, acessibilidade e SEO.
- O link de download funciona mesmo sem JavaScript.
- A leitura é boa no celular.

## Decisões

- **Tecnologia:** HTML, CSS e JavaScript puros, sem framework e sem etapa de build. A única dependência é a biblioteca de animação **Motion** (a versão do Framer Motion para HTML comum, licença MIT), na versão fixa 12.43.0, com o arquivo `motion.min.js` (cerca de 140 KB) guardado dentro de `site/vendor/` junto do aviso de licença. Nada é carregado de outro domínio na hora.
- **Onde fica:** pasta `site/` no mesmo repositório, publicada pelo GitHub Pages. Um repositório separado duplicaria a manutenção sem ganho para uma página só.
- **Idioma:** português do Brasil. Inglês fica fora desta versão.
- **Visual:** página de produto no estilo Apple. Muito espaço, tipografia grande, nenhuma caixa nem borda; o único objeto com sombra é o app. Títulos em duas linhas com a segunda em cinza. Fundo preto puro no tema escuro e quase branco no claro. As cores do app (`app/src/renderer/src/assets/main.css`) continuam valendo para a réplica do app. Tema claro e escuro automáticos pelo sistema, sem seletor na página.
- **O produto é o protagonista:** a página não usa capturas nem vídeo. Ela mostra uma **réplica em HTML da janela do Horizonte**, nas proporções reais da janela (760 x 580), com as telas de verdade (boas-vindas, escolha do modo, lista de aparelhos, conectado). A réplica escala com a largura (unidades de container) e é decorativa para leitores de tela, com a descrição em texto.
- **Tipografia:** fontes do sistema, sem carregar fonte externa.

## Estrutura da página

1. **Topo.** "Horizonte", o título "Estenda sua tela. Sem fio." e a linha "O notebook do seu lado vira a segunda tela do computador. Sem configurar nada." Botão **Baixar grátis** e link **Ver no GitHub**. Abaixo, a réplica do app na tela de conectado ("Notebook conectado", "Tela estendida.", qualidade em Mbps), com um brilho suave atrás.
2. **Frase de efeito.** "Você já tem uma segunda tela. É aquele notebook parado do seu lado. O Horizonte só faz os dois conversarem."
3. **Como funciona** ("Três cliques. Nenhuma configuração."). Uma história em cinco cenas com o app preso na tela enquanto se rola: abrir o Horizonte e clicar em Começar; escolher quem envia e quem mostra; o outro computador aparece sozinho na lista e se clica em Estender; a janela atravessa do computador para o notebook; a qualidade sobe ao vivo. Cada cena tem uma legenda curta e há pontos de progresso.
4. **Números.** 60 fps, 23 Mbps no Wi-Fi 5 GHz com a placa de vídeo, 3 cliques do app aberto até a segunda tela. São os valores medidos no teste de 05/10/2026 com dois PCs Windows; só entram números vistos funcionando.
5. **"Sem conta. Sem nuvem. Sem configurar."** com um parágrafo sobre a rede local e os créditos (Sunshine, Moonlight, Virtual Display Driver).
6. **Baixar.** Uma linha por sistema: Windows (disponível), Linux (`.AppImage` e `.deb`, em teste) e macOS (`.dmg`, em teste). Cada linha aponta para o arquivo da última release. Aviso claro de que o instalador ainda não é assinado, com o que a pessoa vai ver (Windows: "Mais informações" e "Executar assim mesmo"; macOS: "desenvolvedor não identificado").
7. **Perguntas rápidas.** O que precisa para funcionar (dois computadores na mesma rede; no Windows, uma placa de vídeo compatível); por que o Windows avisa na instalação; se é gratuito (sim, GPL-3.0); como relatar um problema (issues do GitHub).
8. **Rodapé.** Link do GitHub, licença e créditos aos projetos que o Horizonte usa.

## Como o download funciona

- O botão Baixar e os cartões da seção 6 leem a última release pela API pública do GitHub (`/repos/mapompeo/horizonte/releases`). Como as versões hoje são todas marcadas como pré-lançamento, a leitura pega a mais recente da lista e não só a marcada como "latest".
- Se a API falhar (limite de uso, sem rede), os botões apontam para a página de releases do projeto. O link `https://github.com/mapompeo/horizonte/releases` fica no HTML como padrão, e o script só o troca por um link direto quando consegue.
- O sistema da pessoa é detectado só para destacar o botão certo. Nenhuma informação é enviada para lugar nenhum.

## Como as pessoas encontram a página

- `title`, `description`, `lang="pt-BR"` e imagem de compartilhamento (Open Graph) com o ícone e a frase.
- `sitemap.xml` e `robots.txt`.
- Tópicos do repositório no GitHub (por exemplo `second-screen`, `sunshine`, `moonlight`, `electron`, `svelte`) e o endereço do site no campo "Website" do repositório.
- **README na raiz do repositório**, que hoje não existe: nome, frase, imagem, link para a landing, como instalar e como contribuir. A landing e o README contam a mesma história com as mesmas palavras.

## Movimento

O movimento é a parte principal da página e segue a prévia aprovada. Todo ele usa molas da Motion e respeita `prefers-reduced-motion`.

- **Abertura:** as palavras do título sobem e ganham foco em cascata; o resto do topo entra em seguida; o app sobe de baixo.
- **App do topo:** começa inclinado em 3D e se endireita conforme a rolagem; depois sobe e esmaece. Inclina levemente seguindo o mouse. O valor de qualidade dentro dele varia sozinho entre 30 e 45 Mbps.
- **Barra do topo:** some ao rolar para baixo e volta ao rolar para cima.
- **Frase de efeito:** acende palavra por palavra, ligada à rolagem.
- **História:** a seção fica presa na tela e a rolagem escolhe a cena. Cada cena troca a tela do app com desfoque e mola, muda o ângulo do app, troca a legenda e estica o ponto de progresso. Um cursor clica nos botões do app. Na cena da janela atravessando, a posição da janela segue a rolagem nos dois sentidos. Na última, os Mbps sobem de 30 para 50 com a rolagem.
- **Números:** contam do zero ao valor quando aparecem.
- **Títulos de seção:** sobem de trás de uma máscara, uma linha de cada vez.
- **Botões:** são atraídos pelo cursor e afundam no toque; os cartões de download sobem ao passar o mouse.

**Sem movimento** (quem pediu menos movimento, ou o script falhou): a página fica inteira parada e legível. A história vira a réplica do app na tela de conectado com as cinco legendas em lista, sem nada preso na tela. Nada fica escondido esperando a rolagem.

## Fora do escopo

Blog, estatísticas de acesso, contas, formulário de contato, inglês, páginas separadas de documentação e qualquer mudança no app. Cada item pode virar uma entrega própria depois.

## Testes

- Lighthouse (desempenho, acessibilidade, melhores práticas, SEO) com nota mínima de 95, no celular e no computador.
- A página abre e todos os links funcionam com o JavaScript desligado.
- A detecção do sistema e o fallback do download foram conferidos com a API respondendo e com a API falhando.
- Tema claro e escuro, tela estreita (360 px) e `prefers-reduced-motion` conferidos à mão.
- As cinco cenas da história conferidas rolando para baixo e para cima, sem salto de cena e sem a janela parar no meio errado.
- A animação roda lisa (sem travar a rolagem) num notebook comum; o que for pesado demais é cortado.
- Verificação de links quebrados antes de publicar.

## Publicação

Fluxo do GitHub Pages por Actions, disparado quando algo em `site/` muda na `main`. A CI existente do app não deve rodar por mudanças só em `site/`.

## Riscos

- **Releases como pré-lançamento.** Se o código que lê a última release assumir que existe uma versão "latest", o botão de download quebra. Por isso a leitura trata a lista inteira e tem o fallback para a página de releases.
- **Instalador sem assinatura.** O aviso de segurança do Windows e do macOS pode assustar quem visita. A página explica o motivo e o que fazer, em vez de esconder o aviso.
- **Movimento demais.** Animação pesada pode travar a rolagem em computador fraco e cansar quem visita. Cada efeito precisa ser leve (só transform e opacidade) e tudo para com `prefers-reduced-motion`.
- **Promessa que o app ainda não cumpre.** Linux e macOS só passaram nos testes automáticos, e o pareamento com um aparelho novo ainda não foi testado em hardware. A página marca o Linux e o macOS como "em teste" e não promete nada além do que foi visto funcionando.
