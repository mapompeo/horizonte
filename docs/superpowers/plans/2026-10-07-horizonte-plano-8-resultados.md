# Plano 8: resultados (Mac e Linux de verdade)

Data: 07/10/2026. Versão: 0.1.0-beta.8.

## O que ficou provado em máquina real (CI com Windows, Linux e macOS)

- App empacotado abre nos três sistemas (`electron-builder --dir` e CDP); no Mac o auxiliar `horizonte-display` está dentro do `.app` e roda.
- Mac: instala Moonlight e Sunshine, cria e remove o monitor virtual próprio (1 para 2 para 1 telas).
- Linux: instala o Sunshine de verdade, cria o monitor virtual (Xorg dummy), baixa o Moonlight AppImage com hash conferido e abre.
- Linux: pareamento por PIN real. O Moonlight pede, a API do Sunshine aprova e o aparelho aparece na lista de pareados.

## O que mudou no produto

- Mac envia com monitor virtual próprio e recebe. Linux envia e recebe.
- Pareamento que passa de 90 s é encerrado e vira erro claro.
- CI não roda a suíte inteira quando só muda documentação.

## Ainda não provado

- Captura e transmissão com encoder de verdade no Mac (a VM de CI não tem).
- O `pair` do Moonlight no Linux registra o aparelho mas não encerra o processo na CI (sem tela). Em máquina real falta confirmar.
- Pareamento por PIN no Mac e no Windows contra um Sunshine de verdade.
- Latência do cursor e velocidade de cópia de arquivos (precisam de duas máquinas reais na mesma rede; VM de CI não serve de medida).
- Comportamento do Gatekeeper com o `.dmg` sem assinatura (contorno documentado no README).
