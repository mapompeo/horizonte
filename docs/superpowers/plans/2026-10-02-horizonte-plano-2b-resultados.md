# Plano 2B: resultados até aqui (03/10/2026)

## Pronto e testado (413 testes, 0 erros de tipo e de lint)

- Download com hash, elevação em uma confirmação, versões fixas (já descritos no plano).
- `secrets.ts`: senha do Sunshine no cofre do sistema (`safeStorage`). Sem cofre disponível, recusa guardar em vez de gravar texto puro. Arquivo corrompido ou de outro usuário vira "sem senha".
- `probes.ts`: detecta serviço do Sunshine rodando e monitor virtual presente, sem administrador. Dúvida vale como "não está". Testado também no PowerShell de verdade.
- `setup.ts`: instalador e monitor virtual compartilham UMA preparação e UM pedido de administrador. Só baixa e instala o que falta; Sunshine rodando sem senha guardada refaz só a credencial. Dentro do processo elevado o arquivo é copiado para uma pasta do administrador e o hash é conferido de novo. O certificado do driver entra só em `TrustedPublisher`. Provado por mutação (duas chamadas = dois pedidos; certificado na raiz).
- `smart-app-control.ts`: lê o estado e devolve uma frase que explica sem sugerir contornar. Neste PC o valor é 1 (ligado).
- `wire.ts` e `index.ts`: no app empacotado, ou com `HORIZONTE_ENGINE=install`, o motor usa as implementações reais. O modo dev com Sunshine já instalado (`HORIZONTE_ENGINE=sunshine`) e a demonstração continuam iguais.

## Decisões tomadas

- A instalação real é opt-in em desenvolvimento (`HORIZONTE_ENGINE=install`), para `npm run dev` nunca instalar driver sem querer. O plano dizia "variável não definida"; ficou mais seguro assim.
- Certificado do driver: só `TrustedPublisher`. Se o Windows exigir a raiz, a instalação falha com mensagem; consentimento explícito na interface fica para depois da prova.
- A tela "Instalando" mostra as etapas reais (motor, monitor, codificador). Porcentagem de download na interface não foi feita: exigiria mudar a máquina de estados.

## Não verificado (só na instalação real)

- Qual variante do script de instalação o `/qn` aciona.
- Se `pnputil /add-driver ... /install` basta ou se é preciso criar o dispositivo (`Root\MttVDD`) para o monitor aparecer. É o ponto de maior risco.
- Se o `Import-Certificate` em `TrustedPublisher` basta para o Windows aceitar o driver.
- A senha vai na linha de comando do processo elevado (`--creds`); é aleatória e só dura aquele instante.
- Smart App Control ligado neste PC pode bloquear o `sunshine.exe` sem assinatura.
