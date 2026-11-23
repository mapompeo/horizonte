# O que é suportado

Ninguém testa tudo. Esta é a lista do que o projeto testa e do que ele só tenta.

| Quem | Situação |
|---|---|
| **Computador que envia**: Windows 10 e 11, macOS (chip Apple e Intel), Linux com GNOME (Wayland ou Xorg) | Suportado. A CI monta e testa os três sistemas a cada mudança. |
| **Aparelho que recebe, pelo navegador moderno**: Chrome e Edge recentes, Safari do iOS 15.4 ou mais novo, Firefox recente | Suportado. É o caminho principal. |
| **Computador que recebe, com o Horizonte** | Suportado. Em Ajustes › Receber a tela de outro computador. |
| **iPad e iPhone antigos, até o iOS 9** | **Melhor esforço.** A tela chega em imagens (o modo compatível), mais lenta e sem tela cheia nem 60 fps. Funciona nos testes; em aparelho de verdade, depende do Safari dele. |
| Linux sem GNOME (KDE, Sway, outros) | Não enviam a tela estendida. Recebem pelo navegador. |
| Windows 7, 8 e anteriores | Não. |

## O que a CI testa

- **Linux:** o app aberto de verdade, o motor entre duas janelas, o celular imitado (iPhone e Android) e o modo compatível de navegador antigo.
- **Windows e macOS:** o app aberto, o motor, o envio de verdade ao navegador (tela estendida), o driver de tela virtual (Windows) e o auxiliar do monitor virtual (Mac).

## O que ainda não é testado por máquina

Aparelhos físicos antigos (iPad 2) e versões específicas do Windows 10. Quem tem um e topa testar ajuda muito: **Ajustes › Enviar diagnóstico** manda o que precisamos.
