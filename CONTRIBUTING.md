# Como contribuir com o Horizonte

Obrigado por querer ajudar. O jeito mais útil, em ordem:

1. **Testar e contar como foi.** No app, em **Ajustes › Enviar diagnóstico**: um clique manda para as Issues o relatório do seu computador (sistema, placa de vídeo, telas e o final dos registros), sem a pasta pessoal, nomes nem IPs completos. Ajuda mais que qualquer descrição.
2. **Abrir uma issue** com o que você esperava e o que aconteceu. Use o modelo de "Algo não funciona".
3. **Mandar uma correção.** Issues com a etiqueta `good first issue`, quando houver, são um bom começo.

## Rodando o projeto

```bash
cd app
npm install
npm run dev        # o app
npm test           # testes unitários
npm run typecheck  # tipos
npm run lint
```

O site fica em `site/` (HTML, CSS e JavaScript, sem build): `cd site && npm test`.

## Regras do projeto

- **Texto na tela nos três idiomas** (português, inglês e espanhol) pelo `L({ pt, en, es })`. Erro novo entra no catálogo `app/src/shared/errors.ts` com código de 3 dígitos; a tabela do site se regenera com `UPDATE_SITE_ERRORS=1 npx vitest run src/shared/errors.test.ts`.
- **Todo teste novo precisa de uma mutação que o derrube**: estrague o código dentro do corpo da função, confira que o teste falha, desfaça.
- **O que muda para quem usa entra em `app/src/shared/changelog.ts`**, em frase curta, nos três idiomas.
- Commits curtos, em português, dizendo o que mudou para quem usa.
- O ambiente de teste do app e do navegador roda na CI nos três sistemas; rode `node e2e/app.mjs` e `node e2e/web.mjs` depois de `npx electron-vite build` para conferir o mesmo aqui.

## O que o projeto não aceita

Coleta de dados, contas, servidores no meio da conexão ou dependência de serviço de terceiros: o Horizonte é só rede local.
