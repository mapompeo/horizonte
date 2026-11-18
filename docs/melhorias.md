# Melhorias do Horizonte

Lista para ir fazendo aos poucos. Marque `[x]` quando estiver na main e provado.

## Ajustes e coisas sem prova

- [x] Primeiro uso: avisos de firewall (Windows, Mac e Linux) com botão que resolve, rede Pública do Windows, Gravação de Tela e Acessibilidade do Mac, janela que vem para a frente no Permitir, QR com o IP certo (fora Docker, VPN e máquinas virtuais).

- [x] Envio de verdade provado na CI nos três sistemas: o app captura a tela real e a tela estendida (driver no Windows, tela virtual no Mac) e um Chrome recebe pelo link com código (`app/e2e/web.mjs`).
- [ ] Ainda falta em máquina de pessoa: o pedido de permissão do Windows (UAC) e do Mac na primeira vez, e copiar e colar e o mouse entre dois computadores.
- [x] Windows: a tela estendida no tamanho exato do aparelho (o `vdd_settings.xml` aprende o tamanho e o driver recarrega pelo canal dele, sem administrador).
- [ ] Assinar os instaladores: Windows com a SignPath Foundation (grátis para código aberto; o pedido é do dono do repositório em signpath.org, com MFA no GitHub; o certificado sai em nome da SignPath Foundation; depois de aprovado, entra a política de assinatura no README e o passo de assinar na CI, antes de gerar o `latest.yml`, senão o hash da atualização não bate). Mac com notarização (conta de desenvolvedor da Apple, US$ 99/ano). Tira o "Editor desconhecido" do SmartScreen e do firewall, e o `xattr`.
- [ ] Ligar o botão Sponsor do repositório (Settings › General › Sponsorships).
- [ ] Seção de apoiadores no README para o nível de $25 do Sponsors (pode ser automática com uma GitHub Action).
- [x] Playwright do site de novo: 84 testes verdes, com o Apoiar (Pix) e a barra do topo; o servidor de teste não servia `.mjs`.
- [x] App aberto de verdade na CI clica no Adicionar, no Copiar link (lendo a área de transferência do sistema), no QR ampliado e nos Ajustes (fps e tema guardados ao reabrir).
- [ ] Testes do que só roda no Electron (fios do motor, `sender`/`receiver`, `native-share`): hoje só os testes de ponta a ponta passam por eles. Cobertura de unidade em 62% das linhas (`npm run test:coverage`).
- [x] Endereço no modo compacto (Adicionar) com o "/código", igual à tela principal.

## Features

- [ ] Som do computador no aparelho (hoje só vai a imagem).
- [ ] Toque e caneta: tablet como tela de toque, com pressão da caneta.
- [ ] Espelhar a tela, além de estender (apresentações).
- [x] Lembrar aparelhos: quem recebe conecta sozinho ao último computador quando o app abre.
- [ ] Conectar fora da mesma rede (pela internet).
- [ ] Conexão por cabo USB no Android (menos latência, sem depender do Wi-Fi).
- [x] Página de receber: tela acesa, imagem até 3x, ícone na Tela de Início, reconectar sozinho e em três idiomas.
- [x] App em português, inglês e espanhol, pelo idioma do sistema (a demonstração do site segue a página).
- [ ] Painel de diagnóstico com latência, fps e qualidade da rede (já há a bolinha de conexão no mapa).
- [x] Atalho global que traz a janela (Ctrl+Alt+H; no Wayland o sistema não deixa sem perguntar, então fica desligado).

## Melhorias

- [ ] Mostrar nos Ajustes a codificação por hardware em uso (NVENC, QuickSync, VideoToolbox).
- [ ] Publicar no winget, Homebrew, Flatpak e AppImage.
- [ ] Vídeo curto de demonstração no topo do site e no README.
- [ ] Domínio próprio no lugar do vercel.app (SEO para "monitor sem fio").
- [ ] Divulgar depois da assinatura: Product Hunt, Reddit (r/opensource, r/linux) e TabNews.
