# Horizonte, Plano 3: receber a tela (resultados)

Data: 03/10/2026. Status: código pronto e testado com falsos (457 testes). Falta a prova com dois aparelhos.

## Feito
- **Descoberta** (PR #6): busca mDNS `_nvstream._tcp` (bonjour-service), sem este aparelho. Provado neste PC: achou o Sunshine local.
- **Cliente Moonlight** (PR #7): monta o `Moonlight.exe stream` com resolução, fps, bitrate e codec, controla o processo e avisa quando a transmissão acaba.
- **Moonlight portátil** (PR #8): zip 6.1.0 com SHA-256 fixo, baixado na primeira conexão para `userData/moonlight` (sem administrador). Extração testada com o zip real.
- **Pareamento sem PIN**: o receptor gera o PIN, manda para `POST http://<host>:47900/pin` e roda `Moonlight pair <host> --pin <PIN>`. O emissor só guarda o PIN (TTL de 2 min, uma entrega, corpo máximo 512 bytes, canal aberto apenas enquanto espera conexão); quem decide é a pessoa, no aviso "Permitir...?". Regra de firewall (perfil Privado, porta 47900) entra no mesmo pedido de administrador da instalação.

## Não verificado (precisa de dois aparelhos ou de uma pessoa na máquina)
- Opções de linha de comando do Moonlight (`pair --pin`, `--video-codec`, `--display-mode`) escritas pela documentação; o Moonlight no Windows não imprime a ajuda no terminal.
- Transmissão e pareamento de ponta a ponta; o spec já registra erro 409 quando o Moonlight roda na mesma máquina do Sunshine.
- O aviso do Windows com a permissão, visto com os olhos; o driver depois de reiniciar o PC.
