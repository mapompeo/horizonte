# Retomada do Plano 2A em outro computador

Branch: `feat/plano-2a-motor-sunshine` (tudo commitado e enviado). Plano completo: `2026-10-02-horizonte-plano-2a-motor-sunshine.md`. Resultados parciais: `2026-10-02-horizonte-plano-2a-resultados.md`.

## Preparar o computador

```powershell
git clone https://github.com/mapompeo/horizonte.git
cd horizonte
git checkout feat/plano-2a-motor-sunshine
cd app
npm install
npm test
npm run dev
```

Sem variáveis `HORIZONTE_*` o app abre com o motor de mentira (demonstração). Para falar com um Sunshine real, defina antes de `npm run dev`:

```powershell
$env:HORIZONTE_ENGINE = 'sunshine'
$env:HORIZONTE_SUNSHINE_USER = 'horizonte'
$env:HORIZONTE_SUNSHINE_PASSWORD = Read-Host 'Senha'
```

Opcionais: `HORIZONTE_SUNSHINE_PORT` (padrão 47989) e `HORIZONTE_SUNSHINE_LOG` (padrão `C:\Program Files\Sunshine\config\sunshine.log`).

Neste novo computador a credencial do Sunshine não existe. Crie em PowerShell de administrador, com uma senha nova:

```powershell
cd 'C:\Program Files\Sunshine'
.\sunshine.exe .\config\sunshine.conf --creds horizonte SUA_SENHA
Restart-Service SunshineService
```

## Próximos passos, em ordem

1. **Evitar reiniciar o Sunshine à toa (bug real, com TDD).** `POST /api/restart` deixou o Sunshine travado na máquina anterior (processo vivo, porta 47990 fechada). Em `app/src/main/engine/sunshine/engine.ts`:
   - Em `resolveEncoder`, antes de sondar, ler o log atual: se `parseFoundEncoder` já mostra hardware e a configuração tem o `amd_usage` de um candidato, lembrar esse candidato e não reiniciar.
   - Em `restart.ts`, quando o Sunshine não volta, a mensagem deve dizer para reiniciar o serviço do Sunshine.
   - Cada mudança com teste que falha antes e mutação provada.
2. **Terminar a Tarefa 12 com o Sunshine real:** pareamento por PIN com o Moonlight, sessão (conectar e desconectar), segunda preparação sem reiniciar, cancelar pedido ao trocar para Mostrar. Confirmar também a suposição do `max_bitrate`. Anotar tudo em `...-resultados.md`.
3. **Revisão final da branch** com um revisor independente (pacote com `review-package`), uma passada de correções, e depois integrar na `main` (merge local ou PR).
4. **Plano 2B:** instalação de verdade no Windows (MSI do Sunshine, driver do monitor virtual, UAC, senha guardada com `safeStorage`). Depois: Plano 3 (cliente, descoberta na rede, Moonlight), Plano 4 (Linux), Plano 5 (instaladores).

## Decisões tomadas durante a execução (Rulings)

- Tarefa 9: os testes esperavam `config.encoder === ''`, mas o motor trata chave ausente como `''` (não grava e não reinicia). Mantive o motor e mudei a asserção para `encoder ?? ''`.
- Tarefa 9: os stubs da Tarefa 10 ficaram sem parâmetros por causa do lint `no-unused-vars`.
- Tarefa 10: `startWatchers` perdeu o parâmetro `settings`, que nunca era usado; o nome padrão virou a constante `GENERIC_DEVICE`.
- Tarefa 11: mantive o limite de porta 65.000 do plano.
- Tarefa 12: `getConfig` ignora `platform`, `status` e `version` (metadados do Sunshine).

## Armadilhas já conhecidas

- O Sunshine renomeia o host para o nome do dispositivo ("Computador") se `sunshine_name` não for ajustado nos Ajustes.
- Segunda instância do Sunshine trava; só existe a do serviço.
- Smart App Control bloqueia o `sunshine.exe`; precisa estar desligado.
- Windows: ferramentas de git no PowerShell mudam quebras de linha; não editar código com `Set-Content`.
