# Horizonte, Plano 2B: instalação de verdade no Windows (rascunho)

Data: 02/10/2026. Base: branch `feat/plano-2a-motor-sunshine` (PR #1). Status: **rascunho para decisão**, nenhuma linha de código escrita.

## Objetivo

Trocar `existingInstaller()` e `existingDisplay()` (que assumem tudo já instalado) por implementações reais no Windows 11: baixar o Sunshine e o driver de monitor virtual em versão fixa, conferir o hash, instalar com **uma única confirmação de administrador por computador** e guardar a senha do Sunshine no cofre do sistema. A pessoa nunca abre o painel do Sunshine nem digita senha.

As interfaces já existem em `app/src/main/platform/types.ts` (`EngineInstaller`, `VirtualDisplay`, `SunshineCredentials`). O motor (`SunshineEngine`) não muda.

## Fatos verificados hoje (API do GitHub)

- Sunshine `v2026.914.233613`, licença GPL-3.0 (compatível com a do Horizonte). Asset do Windows: `Sunshine-Windows-AMD64-installer.msi` (33,7 MB), `sha256:1d7fed8beecd5889dc7ff14cf9f42d6d38f37c3066c13c6c2a5f4e91847e0ccf`. A API já publica o `digest` de cada asset.
- Virtual Display Driver (VDD, MIT). A última versão (`25.7.23`) **não** traz um zip só do driver x64: tem `VDD.Control.25.7.23.zip` (71 MB), `...x86.Driver.Only.zip` e `...ARM64.Driver.Only.zip`. O `VirtualDisplayDriver-x64.zip` existe nas versões `24.10.27` e `24.10.16-beta`.
- Já provado à mão em 02/10/2026 (spec): Sunshine renomeia o host para o nome do dispositivo; `POST /api/restart` pode travar o serviço; Smart App Control bloqueia `sunshine.exe` sem assinatura; o reinício do serviço e o driver exigem administrador.

## Decisões que preciso de você

1. **Versão do driver virtual.** Opções: (a) fixar `24.10.27` (tem o zip x64 só do driver, menor e mais simples de instalar); (b) usar `25.7.23` pelo `VDD.Control` (71 MB, mais novo, instalação menos clara). Recomendo (a), e reavaliar a atualização depois do primeiro teste.
2. **Como pedir administrador.** Recomendo um único processo elevado (`Start-Process -Verb RunAs`) que roda todos os passos privilegiados em sequência (MSI, driver, credencial, reinício do serviço), com o app comum continuando sem privilégio. Alternativa: o app inteiro pedir administrador na abertura (mais simples, pior para segurança e para o "só uma confirmação").
3. **Onde fica a senha.** `safeStorage` do Electron (DPAPI no Windows) num arquivo em `userData`, como já previsto no spec.
4. **Desinstalar.** Entra na v1 (botão em Ajustes) ou fica para depois? Recomendo depois, mas deixando os passos reversíveis.

## Itens a verificar antes de codar (não confirmei)

- Flags silenciosas do MSI do Sunshine (`msiexec /i ... /qn /norestart` e se ele cria e inicia o `SunshineService` sozinho).
- Como o VDD é instalado por linha de comando (`pnputil /add-driver` com o `.inf`) e se precisa instalar o certificado dele antes. Onde ele guarda a resolução (`vdd_settings.xml`?).
- Chave do registro que informa o estado do Smart App Control (`VerifiedAndReputablePolicyState`?). Se não bater, a detecção cai para "o `sunshine.exe` não subiu" e a mensagem explica o bloqueio.
- Que a credencial pode ser criada com `sunshine.exe <conf> --creds <usuário> <senha>` (já usado à mão) dentro do processo elevado.

## Estrutura de arquivos (proposta)

```
app/src/main/platform/windows/
  versions.ts          versões fixas: url, sha256, tamanho, de onde vem cada uma
  download.ts          baixa para pasta temporária, confere o hash, reporta progresso
  elevation.ts         roda um roteiro como administrador (uma confirmação)
  installer.ts         EngineInstaller real (detecta, instala, sobe o serviço, cria credencial)
  display.ts           VirtualDisplay real (instala o driver, define 1920x1080 a 60 Hz)
  smart-app-control.ts detecta o bloqueio e devolve a mensagem em português
  secrets.ts           guarda e lê a senha com safeStorage
  *.test.ts            um por arquivo, com download e elevação falsos
```

## Tarefas (cada uma com teste primeiro e prova por mutação)

1. **Versões fixas e download com hash.** `download.ts` baixa em streaming, confere o SHA-256 e apaga o arquivo se não bater. Teste: arquivo adulterado é recusado; falha de rede vira erro claro; progresso chega a 100%. Mutação: ignorar a comparação do hash deve quebrar o teste.
2. **Elevação em uma confirmação.** `elevation.ts` recebe uma lista de passos e executa todos num processo só; recusa do UAC vira o erro tipado "permissão de administrador recusada". Teste com executor falso.
3. **Detectar o que já está instalado.** Se o serviço e a API respondem, pula a instalação; se o MSI já está na versão fixa, não reinstala. Evita pedir administrador à toa.
4. **Instalador real do Sunshine.** Baixa o MSI, instala em silêncio, cria a credencial aleatória, sobe o serviço e espera a API responder. A senha vai para `secrets.ts`; nunca para log nem para tela.
5. **Monitor virtual real.** Baixa o driver, instala, define 1920x1080 a 60 Hz e deixa o `isVirtual` reconhecer o monitor pelo nome. `findVirtualDisplay` do motor já grava o `output_name`.
6. **Smart App Control.** Detecta e explica sem tentar contornar (regra do spec). Mensagem de uma frase e botão "Tentar de novo".
7. **Costura.** Em `index.ts`, usar as implementações reais quando `HORIZONTE_ENGINE` não estiver definido e o sistema for Windows; manter o modo dev com Sunshine já instalado como está. Tela "Instalando" passa a mostrar o progresso real (hoje é simulado).
8. **Prova no computador limpo.** Num Windows 11 limpo (VM Hyper-V, com a GPU emulada, então codificação por processador): instalar, preparar, parear e conectar. Anotar tudo em `...-plano-2b-resultados.md`.

## Fora do escopo do 2B

Linux (plano 4), cliente e Moonlight (plano 3), instaladores do próprio Horizonte e assinatura de código (plano 5), desinstalação (decisão 4 acima).

## Riscos

- O driver virtual é de terceiros e instala um driver no sistema: se o certificado dele não for confiável para o Windows, o passo falha; precisa de teste real.
- Rede: o download pesa ~34 MB (Sunshine) mais o driver; sem internet o app deve dizer isso em vez de travar.
- Uma versão fixa envelhece: definir quem atualiza o `versions.ts` e como se confere o hash novo (sugestão: o `digest` da API do GitHub, conferido à mão no commit).
