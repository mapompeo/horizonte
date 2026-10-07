# Confiabilidade e integração do Horizonte

Pedido aprovado em 07/10/2026: melhorar confiabilidade, distribuição, qualidade automática, disposição das telas, área de transferência, arquivos e compartilhamento de mouse; revisar a qualidade do código do projeto.

## Critério de entrega

Cada recurso precisa de comportamento integrado ao app, testes de falha e cancelamento, testes de sistema pertinentes e resultado explícito. Um adaptador simulado não comprova vídeo em hardware real. Não habilitar compartilhamento de dados sem aprovação do dispositivo e proteção do canal.

## Etapas

1. Confiabilidade: impedir conexões concorrentes e abertura após Sair; recuperar quedas de sessões estabelecidas com até três tentativas e espera de 1, 2 e 4 segundos; não reconectar término normal ou cancelamento. Falha precoce continua seguindo recuperação de pareamento.
2. Erros e diagnóstico: manter ajustes confirmados quando a gravação falha; distinguir abertura, pareamento, transmissão e recuperação; devolver falhas de processos ao app. Preservar diagnóstico sem credenciais.
3. Distribuição: preparar assinatura e notarização a partir de certificados reais; atualizar somente por fonte oficial e integridade conferida. Não afirmar assinatura oficial com assinatura ad hoc. Credenciais precisam ficar exclusivamente nos Secrets do GitHub.
4. Qualidade automática: coletar métricas reais do motor antes de adaptar bitrate. Limites, intervalo mínimo entre ajustes e controle manual continuam disponíveis. Não usar resultado de ping como medida de perda de vídeo ou inventar telemetria.
5. Disposição de telas: visualizar monitores e arrastar o receptor; aplicar coordenadas por adaptador nativo, salvar e restaurar disposição. Limitar mudanças aos monitores envolvidos e respeitar DPI.
6. Compartilhamento: modo separado para Deskflow; pinagem do certificado entre dispositivos aprovados; texto primeiro, arquivos depois. Arquivos com aceitação, limite, progresso, cancelamento, integridade e proteção contra path traversal. Nunca abrir arquivos recebidos automaticamente.

## Validação e dependências externas

- CI: Windows, Linux e macOS; app e pacote aberto; testes com processos reais e servidores locais.
- Hardware: Mac com Windows nos dois sentidos, permissão de captura, aceleração, latência, suspensão, Wi-Fi e monitor virtual. Requer os dois dispositivos disponíveis para o teste.
- Assinatura oficial: não há Secrets de assinatura no repositório na inspeção de 07/10. Certificado Windows e Developer ID/credenciais de notarização Apple são dependências externas, sem compra ou criação de conta nesta implementação.
- Linux: monitor virtual atual exige Xorg. Não considerar Wayland suportado por causa de testes Xorg verdes.

## Revisão de qualidade

Revisar núcleo, IPC/preload, interfaces Svelte, motores, adaptadores dos três sistemas, processos, armazenamento, rede, gateway, instaladores, auxiliar Swift, demo/site e workflows. Registrar achados com arquivo, consequência, correção e evidência. Não substituir revisão manual por contagem de testes.
