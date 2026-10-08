# Recuperação e suporte na beta.11

A publicação da beta.11 foi interrompida antes de gerar instaladores: a compilação C# do teste de driver no Windows levou 6 segundos, acima do prazo padrão de 5 segundos. A beta.12 contém o mesmo comportamento do produto e um prazo explícito para esse teste: processo limitado a 20 segundos, teste limitado a 25 segundos. A asserção de vinculação do driver permanece obrigatória. A tag beta.11 não foi reescrita.

## Problema confirmado

Depois da remoção do pacote MTT, este Windows manteve o dispositivo `ROOT\DISPLAY\0001`, com HardwareID `Root\MttVDD`, mas sem classe Display nem driver vinculado. A beta.10 tratava a presença do dispositivo como instalação completa. O Sunshine enxergava apenas o monitor físico.

A detecção exige agora classe Display e status OK. O roteiro vincula o driver também ao dispositivo que já existe. Um teste executa esse caso em PowerShell real com APIs nativas substituídas, sem modificar o Windows do runner.

A tentativa de recuperação física deste PC foi interrompida por falta de consentimento UAC. Não é evidência de monitor recuperado. Na próxima preparação, a versão corrigida deverá solicitar a instalação e o aviso de administrador.

## Diagnóstico

Enviar diagnóstico abre uma revisão local. O formulário do GitHub recebe versão, sistema, modo, qualidade e código de erro conhecido. Mensagens livres e detalhes de logs não entram no envio. Incluir o resumo do histórico dos últimos sete dias é opcional.

Abrir o formulário já compartilha o texto revisado com o GitHub. Publicar a Issue exige login e confirmação do usuário no GitHub. Não há coleta automática nem serviço privado de telemetria.

Os relatos publicados recebem a etiqueta `diagnostico`. Acompanhamento: https://github.com/mapompeo/horizonte/issues?q=is%3Aissue+label%3Adiagnostico

Copiar diagnóstico continua disponível separadamente, com detalhes para atendimento manual. Links longos usam cópia do resumo revisado e formulário vazio, sem truncar silenciosamente.

## Desinstalação

Em Ajustes, Desinstalar Horizonte abre o desinstalador oficial do Windows após confirmação. Conexões e verificações/downloads de atualização ativos bloqueiam a ação. O bloqueio é reavaliado depois da confirmação. Não aceita caminho de executável vindo da interface.

Sunshine, Moonlight e driver permanecem, pois são componentes separados que podem atender outros aplicativos. Mac e Linux mostram instruções para remoção pelo sistema. Não há promessa de remoção automática nesses sistemas.

## Validação

- 733 testes locais passaram após integrar recuperação, desinstalação e diagnósticos.
- Typecheck, Svelte e ESLint sem erros.
- Dez etapas do Electron real no Windows passaram, incluindo clicar no botão de remoção em desenvolvimento sem remover nada.
- O teste da revisão de diagnóstico no navegador verifica cancelamento sem envio, resumo opcional, cópia por limite de URL e falha ao abrir o GitHub.
- A atualização da beta.10 instalada para beta.11 e a recuperação física do monitor exigem validação separada; não estão comprovadas por testes com dependências substituídas.
