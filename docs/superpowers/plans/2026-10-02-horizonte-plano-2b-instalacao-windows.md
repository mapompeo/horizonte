# Horizonte, Plano 2B: instalação de verdade no Windows (rascunho)

Data: 02/10/2026. Base: branch `feat/plano-2a-motor-sunshine` (PR #1). Status: em execução. Tarefas 1 e 2 prontas (versões fixas, download com hash, elevação); 3 a 8 dependem da instalação real.

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

## Verificado em 02/10/2026 (lendo o MSI e o zip, sem instalar nada)

- **MSI do Sunshine:** o hash baixado bate com o fixado. O MSI **não declara o serviço do Windows**: ele roda uma ação customizada (`CA_SunshineInstallSilent`) que chama `scripts\sunshine-setup.ps1 -Action install -Silent`. Esse script cria o `SunshineService` (`sc create`, `binPath` em `tools\sunshinesvc.exe`), adiciona as regras de firewall, liga a partida automática (`sc config SunshineService start= auto`) e inicia o serviço. A variante silenciosa não abre a documentação no navegador. Não há instalação de driver de gamepad nesse script.
- **Instalação silenciosa:** `msiexec /i <msi> /qn /norestart` deve acionar a variante silenciosa, mas **a condição que escolhe a variante não consegui ler**: confirmar na primeira instalação real.
- **Driver virtual (zip 24.10.27, x64):** contém `MttVDD.inf`, `MttVDD.dll`, `mttvdd.cat`, `Virtual_Display_Driver.cer`, `installCert.bat` e `vdd_settings.xml`. O `installCert.bat` instala o certificado nas lojas **`root` e `TrustedPublisher`**. A resolução e a taxa vêm do `vdd_settings.xml` (1920x1080 já existe nas opções, com 30 a 165 Hz; `monitors/count` é 1).
- Este computador não tem o `SunshineService`: serve como máquina limpa para a prova do 2B (ver a decisão 5).

## Decisão de segurança (nova)

5. **Certificado do driver.** O `installCert.bat` do VDD põe um certificado **autoassinado** como autoridade raiz confiável do computador, e não só como publicador confiável. Isso é um poder grande para um app de segunda tela. Recomendo instalar o certificado **apenas em `TrustedPublisher`** e testar se o `pnputil /add-driver` funciona assim; se o Windows exigir a raiz, o app deve **explicar e pedir consentimento** antes, e nunca fazer isso em silêncio. Preciso do seu aval para esse critério.

## Itens que ainda faltam verificar (só na instalação real)

- Qual variante do script o `/qn` aciona (acima).
- `pnputil /add-driver MttVDD.inf /install` com só o `TrustedPublisher`, e como o monitor virtual aparece para o Sunshine (`friendly_name` "VDD by MTT" já visto à mão).
- Chave do registro do estado do Smart App Control (`VerifiedAndReputablePolicyState`?); se não bater, a detecção cai para "o `sunshine.exe` não subiu".
- A credencial: `sunshine.exe <conf> --creds <usuário> <senha>` dentro do processo elevado, e o reinício do serviço (`Restart-Service SunshineService`).

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
