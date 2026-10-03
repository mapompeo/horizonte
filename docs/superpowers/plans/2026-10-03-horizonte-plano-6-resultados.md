# Horizonte, Plano 6: receber pelo navegador (resultados)

Data: 03/10/2026. Status: gateway funcionando e provado de ponta a ponta no servidor; falta a prova num navegador de outro aparelho (vídeo).

## Decisão técnica
O Sunshine não fala WebRTC. Em vez de escrever um cliente, o Horizonte embute o **Moonlight Web 2.10.0** (GPL-3.0, compatível; zip do Windows com SHA-256 fixo) e o roda nesta máquina. O navegador do outro aparelho abre `http://<ip>:8080`; o gateway fala Moonlight com o Sunshine local e entrega o vídeo por WebRTC.

## Feito
- `main/web/gateway.ts` + `wire.ts`: baixa e extrai o gateway (hash conferido), gera a configuração **sem servidores STUN do Google** (tudo na rede local), faixa de vídeo fixa UDP 40000–40010, nome do dispositivo no pareamento.
- **Segurança:** depois de pareado, quem alcançar o endereço veria a tela sem pedir licença. Por isso o acesso exige usuário (`horizonte`) e um código aleatório de 8 caracteres, guardado no cofre do sistema e mostrado só na tela do Horizonte. O primeiro login cria o administrador; isso é feito só em `127.0.0.1`, antes de abrir para a rede, para ninguém chegar primeiro.
- Firewall (perfil Privado): TCP 47900 e 8080, UDP 40000–40010, no mesmo aviso de administrador da instalação (regra renomeada para "v2": instalações antigas recriam).
- Tela Pronto: botão "Receber pelo navegador (sem instalar nada)", mostra o endereço, o usuário e o código. O gateway para ao desligar o botão e ao fechar o app.
- **Provado de verdade** (teste temporário, não commitado): baixou o zip, conferiu o hash, extraiu, subiu em loopback, criou o acesso, abriu para a rede, login certo = 200, senha errada = 401, parar derrubou o processo.

## Não verificado
- Vídeo no navegador de outro aparelho (pareamento pelo PIN que o gateway mostra, tela de aprovação do Horizonte, latência, HTTPS: gamepad e teclado completo só funcionam em contexto seguro).
- Linux (o pacote `.tar.gz` existe; falta o wiring) e a ordem "pareamento do gateway com o Sunshine" na primeira conexão.
