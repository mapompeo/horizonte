# Política de assinatura de código

Os instaladores do Horizonte para Windows são montados e assinados pela CI do GitHub, a partir do código deste
repositório, sem nenhum passo feito à mão.

## Quem faz o quê

- **Autores e revisores:** quem tem permissão de escrita no repositório ([mapompeo](https://github.com/mapompeo)).
  Todo código entra pela branch `main`, e a CI roda os testes nos três sistemas antes de montar qualquer instalador.
- **Aprovador das assinaturas:** [mapompeo](https://github.com/mapompeo). Cada pedido de assinatura sai da CI do
  GitHub (máquinas do próprio GitHub) e só é assinado o que ela montou.
- Todas as contas com acesso ao repositório e à assinatura usam verificação em duas etapas.

## O que é assinado

- O app (`Horizonte.exe`), o auxiliar do modo Mouse (`horizonte-mouse.exe`) e o instalador
  (`Horizonte-<versão>-setup.exe`).
- O driver de monitor virtual que o app instala no Windows é de outro projeto
  ([Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver)), vem com a assinatura dele e é
  conferido pelo hash antes de instalar. Ele não é assinado por nós.

## Privacidade

O Horizonte não manda dados para fora da rede local, a não ser nestes casos:

- **Procurar atualizações:** consulta as versões publicadas no GitHub.
- **Enviar diagnóstico:** só quando a pessoa toca no botão nos Ajustes. Vão a versão, o sistema, a placa de vídeo, as
  telas e o final do registro do app, para o site do Horizonte, que abre uma issue pública no GitHub. Antes de sair do
  computador, o texto perde a pasta pessoal, o nome do computador, do usuário e dos aparelhos, as senhas conhecidas e o
  fim dos IPs.
- **Instalar o monitor virtual (Windows):** baixa o driver da página de versões dele no GitHub, na primeira tela
  estendida, com a permissão da pessoa.

A imagem, o mouse e o teclado vão direto de um aparelho para o outro, na rede local, sem servidor.
