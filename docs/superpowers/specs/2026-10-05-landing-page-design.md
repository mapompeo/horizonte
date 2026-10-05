# Horizonte: landing page

Data: 2026-10-05. Aprovada em conversa com a pessoa dona do projeto antes de ser escrita. Esta spec é só a página de descoberta; o app não muda.

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

- **Tecnologia:** HTML e CSS puros, mais um script pequeno só para escolher o download pelo sistema da pessoa e ler a última release. Sem framework, sem etapa de build, sem dependências.
- **Onde fica:** pasta `site/` no mesmo repositório, publicada pelo GitHub Pages. Um repositório separado duplicaria a manutenção sem ganho para uma página só.
- **Idioma:** português do Brasil. Inglês fica fora desta versão.
- **Visual:** a mesma identidade do app, que é calma, no estilo Apple. Usa as cores e o movimento definidos em `app/src/renderer/src/assets/main.css` (fundo `--bg`, texto `--fg`, destaque `--accent`, curva de movimento `--ease`). Tema claro e escuro automáticos pelo sistema. Quem pede menos movimento (`prefers-reduced-motion`) não vê animação.
- **Tipografia:** fontes do sistema, sem carregar fonte externa.

## Estrutura da página

1. **Topo.** Ícone, nome, a frase "Estenda sua tela, sem fio." e uma linha de apoio ("Sem configurar nada."). Dois botões: **Baixar** (já com o sistema da pessoa detectado) e **Ver no GitHub**. Abaixo, a demonstração em destaque.
2. **Como funciona.** Três passos curtos: instale nos dois computadores, escolha Enviar em um e Mostrar no outro, clique em Estender.
3. **Por que usar.** Três blocos: não precisa configurar nada; fica na sua rede, sem conta e sem nuvem; código aberto por baixo (Sunshine, Moonlight e Virtual Display Driver).
4. **Baixar.** Uma linha por sistema: Windows (disponível), Linux (`.AppImage` e `.deb`, em teste) e macOS (`.dmg`, em teste). Cada linha aponta para o arquivo da última release. Aviso claro de que o instalador ainda não é assinado, com o que a pessoa vai ver (Windows: "Mais informações" e "Executar assim mesmo"; macOS: "desenvolvedor não identificado").
5. **Perguntas rápidas.** O que precisa para funcionar (dois computadores na mesma rede; no Windows, uma placa de vídeo compatível); por que o Windows avisa na instalação; se é gratuito (sim, GPL-3.0); como relatar um problema (issues do GitHub).
6. **Rodapé.** Link do GitHub, licença e créditos aos projetos que o Horizonte usa.

## Como o download funciona

- O botão Baixar e a tabela da seção 4 leem a última release pela API pública do GitHub (`/repos/mapompeo/horizonte/releases`). Como as versões hoje são todas marcadas como pré-lançamento, a leitura pega a mais recente da lista e não só a marcada como "latest".
- Se a API falhar (limite de uso, sem rede), os botões apontam para a página de releases do projeto. O link `https://github.com/mapompeo/horizonte/releases` fica no HTML como padrão, e o script só o troca por um link direto quando consegue.
- O sistema da pessoa é detectado só para destacar o botão certo. Nenhuma informação é enviada para lugar nenhum.

## Como as pessoas encontram a página

- `title`, `description`, `lang="pt-BR"` e imagem de compartilhamento (Open Graph) com o ícone e a frase.
- `sitemap.xml` e `robots.txt`.
- Tópicos do repositório no GitHub (por exemplo `second-screen`, `sunshine`, `moonlight`, `electron`, `svelte`) e o endereço do site no campo "Website" do repositório.
- **README na raiz do repositório**, que hoje não existe: nome, frase, imagem, link para a landing, como instalar e como contribuir. A landing e o README contam a mesma história com as mesmas palavras.

## Conteúdo que depende da pessoa

A demonstração precisa de mídia real do app funcionando. O que dá para gerar automaticamente são capturas de tela de cada tela do app. O que não dá é a gravação de dois computadores juntos, com a segunda tela estendida, que precisa ser feita pela pessoa.

Até existir a gravação, a página usa uma captura do app em vez do vídeo, e o lugar da demonstração fica pronto para receber o vídeo sem mudar o resto do layout. A gravação em si fica fora do código desta entrega.

## Fora do escopo

Blog, estatísticas de acesso, contas, formulário de contato, inglês, páginas separadas de documentação e qualquer mudança no app. Cada item pode virar uma entrega própria depois.

## Testes

- Lighthouse (desempenho, acessibilidade, melhores práticas, SEO) com nota mínima de 95, no celular e no computador.
- A página abre e todos os links funcionam com o JavaScript desligado.
- A detecção do sistema e o fallback do download foram conferidos com a API respondendo e com a API falhando.
- Tema claro e escuro, tela estreita (360 px) e `prefers-reduced-motion` conferidos à mão.
- Verificação de links quebrados antes de publicar.

## Publicação

Fluxo do GitHub Pages por Actions, disparado quando algo em `site/` muda na `main`. A CI existente do app não deve rodar por mudanças só em `site/`.

## Riscos

- **Releases como pré-lançamento.** Se o código que lê a última release assumir que existe uma versão "latest", o botão de download quebra. Por isso a leitura trata a lista inteira e tem o fallback para a página de releases.
- **Instalador sem assinatura.** O aviso de segurança do Windows e do macOS pode assustar quem visita. A página explica o motivo e o que fazer, em vez de esconder o aviso.
- **Promessa que o app ainda não cumpre.** Linux e macOS só passaram nos testes automáticos, e o pareamento com um aparelho novo ainda não foi testado em hardware. A página marca o Linux e o macOS como "em teste" e não promete nada além do que foi visto funcionando.
