# Melhorias do Horizonte

Lista para ir fazendo aos poucos. Marque `[x]` quando estiver na main e provado.

## Ajustes e coisas sem prova

- [x] Envio de verdade provado na CI nos três sistemas: o app captura a tela real e a tela estendida (driver no Windows, tela virtual no Mac) e um Chrome recebe pelo link com código (`app/e2e/web.mjs`).
- [ ] Ainda falta em máquina de pessoa: o pedido de permissão do Windows (UAC) e do Mac na primeira vez, e copiar e colar e o mouse entre dois computadores.
- [ ] Windows: a tela estendida veio em 800x600 quando o pedido foi 1024x640 (o driver só tem alguns tamanhos). Escrever o `vdd_settings.xml` com o tamanho do aparelho.
- [ ] Assinar os instaladores: Windows com assinatura gratuita para código aberto (SignPath); Mac com notarização (conta de desenvolvedor da Apple, US$ 99/ano). Tira o SmartScreen e o `xattr`.
- [ ] Ligar o botão Sponsor do repositório (Settings › General › Sponsorships).
- [ ] Seção de apoiadores no README para o nível de $25 do Sponsors (pode ser automática com uma GitHub Action).
- [ ] Rodar o Playwright do site de novo (o último foi antes da galeria, do Apoiar e do rodapé em notch).
- [x] Endereço no modo compacto (Adicionar) com o "/código", igual à tela principal.

## Features

- [ ] Som do computador no aparelho (hoje só vai a imagem).
- [ ] Toque e caneta: tablet como tela de toque, com pressão da caneta.
- [ ] Espelhar a tela, além de estender (apresentações).
- [ ] Lembrar aparelhos: reconectar sozinho quando os dois estão ligados.
- [ ] Conectar fora da mesma rede (pela internet).
- [ ] Conexão por cabo USB no Android (menos latência, sem depender do Wi-Fi).
- [ ] Página de receber: manter a tela acesa (Wake Lock), instalar como app (PWA) e imagem nítida em tela retina.
- [ ] App em inglês e espanhol (o site já tem os três idiomas).
- [ ] Painel de diagnóstico com latência, fps e qualidade da rede.
- [ ] Ícone na bandeja e atalho global para ligar e desligar.

## Melhorias

- [ ] Mostrar nos Ajustes a codificação por hardware em uso (NVENC, QuickSync, VideoToolbox).
- [ ] Publicar no winget, Homebrew, Flatpak e AppImage.
- [ ] Vídeo curto de demonstração no topo do site e no README.
- [ ] Domínio próprio no lugar do vercel.app (SEO para "monitor sem fio").
- [ ] Divulgar depois da assinatura: Product Hunt, Reddit (r/opensource, r/linux) e TabNews.
