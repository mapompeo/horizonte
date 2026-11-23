# Segurança

O Horizonte recebe conexões de outros aparelhos da sua rede local e controla mouse e teclado de uma tela estendida, então vulnerabilidade aqui importa.

## Como avisar

**Não abra uma issue pública** para uma falha de segurança. Use o aviso privado do GitHub: aba **Security › Report a vulnerability** deste repositório. Conte o que dá para fazer, como reproduzir e a versão (Ajustes › Sobre).

Respondo em poucos dias. Corrigida a falha, ela entra no "O que mudou" da versão e você é citado se quiser.

## O que o app faz (resumo)

- A imagem, o mouse e o teclado vão direto entre os aparelhos, na rede local, sem servidor. Cada aparelho novo precisa do **Permitir** no computador.
- A conexão confere o certificado do outro aparelho (impressão digital) antes de aceitar a oferta de vídeo.
- Para fora da rede local, só: procurar atualizações (GitHub) e, quando a pessoa toca em **Enviar diagnóstico**, o relatório sem dados pessoais. Detalhes em [docs/assinatura-de-codigo.md](docs/assinatura-de-codigo.md).

## Versões com suporte

Só a versão mais recente em [Releases](https://github.com/mapompeo/horizonte/releases) recebe correção.
