# Horizonte, Plano 2A: Motor Sunshine (camada de controle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o motor de mentira do lado "enviar" por um `SunshineEngine` que fala de verdade com o Sunshine (API REST local e log), de modo que pareamento por PIN, escolha do monitor virtual e escolha do encoder funcionem no Windows com a instalação que já existe nesta máquina.

**Architecture:** O `SunshineEngine` implementa só o papel de servidor do `EnginePort` e é composto com o `FakeEngine` no papel de cliente (o cliente real é o Plano 3). Ele é feito de peças pequenas e testáveis com dublês: cliente da API (HTTPS em loopback), vigia de pareamentos (consulta a cada 2 s), leitura do log (monitores, encoder, sessão), reinício com leitura do log e uma sonda de encoder. Instalar o Sunshine, instalar o driver do monitor virtual e criar credenciais (tudo que exige administrador) ficam atrás de interfaces e entram no Plano 2B; aqui existem adaptadores "instalação existente" só para desenvolvimento.

**Tech Stack:** Electron, TypeScript estrito, Svelte 5, Vitest, Node `https`, servidor HTTPS falso para testes.

**Spec:** `docs/superpowers/specs/2026-10-02-horizonte-design.md`. Plano anterior: `docs/superpowers/plans/2026-10-02-horizonte-plano-1-fundacao.md` (já integrado ao `main`).

## Fatos verificados hoje, 02/10/2026 (Sunshine 2026.914.233613, Windows 11)

Quem executar este plano pode confiar nestes fatos; o que não está aqui é suposição e vem marcado como tal.

- **Autenticação da API:** Basic auth. Painel e API em HTTPS na porta base + 1 (47990 para a base 47989), certificado autoassinado. Clientes que não mandam `Origin` nem `Referer` não passam por CSRF (documentação oficial).
- **Rotas que o painel usa** (extraídas dos arquivos do painel instalado): `/api/apps`, `/api/apps/close`, `/api/clients/list`, `/api/clients/unpair`, `/api/clients/unpair-all`, `/api/clients/update`, `/api/config`, `/api/configLocale`, `/api/logs`, `/api/password`, `/api/pin`, `/api/restart` e outras sem relação com este plano.
- **Pareamento (lido do código do painel):** `GET /api/pin` devolve `{ pairings: [{ id, name, address }] }` e o painel consulta a cada 2 s; `POST /api/pin` recebe `{ pairing_id, pin, name }` e devolve `{ status: true|false }`; `DELETE /api/pin` cancela o pedido selecionado. O PIN de 4 dígitos **aparece no cliente** (Moonlight) e é digitado no servidor.
- **Credenciais:** `sunshine.exe --creds <usuário> <senha>` existe. A ordem importa: o caminho do arquivo de configuração tem de vir **antes** (`sunshine.exe <conf> --creds u s`). Sem o caminho, ele tenta gravar na instalação principal e exige administrador.
- **Diretório de trabalho:** o `sunshine.exe` usa caminhos relativos para os shaders; precisa rodar com a pasta da instalação como diretório de trabalho.
- **Segunda instância na mesma máquina:** travou (código 0xC0000409) logo depois de "File ... doesn't exist" ao iniciar. Não dá para testar contra uma segunda instância isolada. Por isso o teste de integração real usa a instância principal, com você presente (Tarefa 12).
- **Log** (`C:\Program Files\Sunshine\config\sunshine.log`, legível sem administrador): a primeira linha é `Sunshine version: ...`; o teste de encoders começa em `// Testing for available encoders...`; o resultado é `Found H.264 encoder: h264_amf [amdvce]` (GPU) ou `Found H.264 encoder: libx264 [software]`; a partida termina em `Configuration UI available at [https://localhost:47990]`; a lista de monitores vem como JSON depois de `Currently available display devices:`; um cliente conectando aparece como `CLIENT CONNECTED`.
- **O teste de encoder da partida é instável:** com a mesma configuração (`amd_usage = lowlatency_high_quality`) ele falhou na partida de 17:11 (`Encoder [amdvce] failed`) e deu certo às 17:21, na conexão do cliente. Por isso a sonda deste plano é **consultiva**: nunca forçamos o processador por causa dela (ver Tarefa 9).
- **Suposições, ainda não verificadas:** (a) `POST /api/config` pode **substituir** o arquivo inteiro em vez de mesclar, então o cliente da API sempre lê, mescla e grava (Tarefa 4); (b) `POST /api/restart` reinicia o processo e gera um log novo; (c) a chave `max_bitrate` existe; (d) o formato exato da resposta de `GET /api/config` (valores podem não ser texto). A Tarefa 12 confere tudo isso na instância real.

## Escopo e roadmap

Este plano cobre da spec: pareamento com o PIN, escolha do monitor virtual, escolha do encoder (sondagem), controle do Sunshine pela API, eventos de conexão. Não cobre: instalar o Sunshine e o driver do monitor virtual, criar o monitor, criar credenciais, guardá-las no cofre do sistema e pedir permissão de administrador (**Plano 2B**); descoberta e cliente (**Plano 3**); Linux (**Plano 4**); instalador (**Plano 5**).

## Global Constraints

- Idioma de toda a interface e das mensagens de erro: português do Brasil. Sem travessões (`—`) em nenhum texto, nem em comentários.
- TypeScript `strict`, Svelte 5 com runes, Vitest. Nenhuma biblioteca nova em produção: a API usa `node:https`. Só dependências de desenvolvimento já presentes.
- Credenciais do Sunshine nunca aparecem em log, em mensagem de erro, em `detail` de erro, nem em arquivo do repositório.
- A API do Sunshine só é acessada em loopback (`127.0.0.1`, `localhost`, `::1`). O certificado autoassinado só é aceito nessa condição.
- O PIN é sempre 4 dígitos (`/^\d{4}$/`). Nada além disso chega à API.
- Todo comportamento de sistema vive atrás de interfaces em `src/main/platform/` (nada novo específico de sistema fora dessa pasta, exceto o adaptador de dev).
- A sonda de encoder nunca força o processador sozinha. O processador só é forçado quando o usuário escolhe "Processador" nos Ajustes.
- Commits: mensagem curta em português (`feat:`, `fix:`, `test:`, `chore:`), nunca `Co-Authored-By` nem menção a IA.
- Cada tarefa roda `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` em `app/` antes do commit final dela.

## Review Focus

1. API do Sunshine fora do ar, reiniciando, com senha errada, respondendo 500, lixo, corpo gigante ou travada: nada pode travar o app nem sumir em silêncio; cada caso vira uma mensagem clara em português (Tarefa 4).
2. Vigia de pareamentos: consulta lenta que não pode se sobrepor, pedido repetido, pedido que some, API que cai no meio, `stop()` com consulta em andamento, callback que lança (Tarefa 5).
3. PIN e nomes: só 4 dígitos chegam à API; nome de dispositivo hostil é limpo; segredos nunca vazam em mensagens (Tarefas 1, 4, 10).
4. Credenciais e TLS: nunca enviadas a um endereço que não seja loopback (Tarefa 4).
5. Log: arquivo ausente, truncado, gigante, de uma execução antiga, sem a seção procurada ou com a lista de monitores quebrada deve virar "não achei", nunca exceção (Tarefas 6, 7, 8).
6. Reinício: ler o log velho como se fosse o novo, ou nunca ver o Sunshine voltar, deve ser detectado (Tarefa 7).
7. Configuração: gravar um trecho nunca pode apagar o resto da configuração do usuário (Tarefa 4).

---

## Estrutura de arquivos

```
app/src/shared/pin.ts                          isValidPin
app/src/main/engine/port.ts                    (modifica) ServerEngine, ClientEngine, EnginePort
app/src/main/engine/fake.ts                    (modifica)
app/src/main/engine/compose.ts                 composeEngine
app/src/main/engine/sunshine/
  api.ts                                       SunshineApi, SunshineApiError
  pairing-watcher.ts                           createPairingWatcher
  log.ts                                       parsers puros do log
  log-file.ts                                  readLogTail
  restart.ts                                   createRestarter
  encoder-probe.ts                             createLogEncoderProbe, amdConfig
  memory.ts                                    createEngineMemory
  session-watcher.ts                           createSessionWatcher
  engine.ts                                    SunshineEngine
  testing/fake-sunshine.ts                     servidor HTTPS falso
  testing/fake-process.ts                      processo Sunshine simulado (API + log)
  testing/localhost-cert.pem, localhost-key.pem
app/src/main/platform/types.ts                 EngineInstaller, VirtualDisplay, SunshineCredentials
app/src/main/platform/existing.ts              adaptadores "instalação existente" (dev)
app/src/renderer/src/screens/Approve.svelte    (modifica) campo do PIN
```

---

### Task 1: Contrato de pareamento (PIN e cancelamento)

O Sunshine só aceita o pareamento com o PIN que aparece no cliente. O núcleo precisa carregar o `pairingId`, aceitar um PIN digitado (ou já conhecido, quando o nosso cliente do Plano 3 o enviar) e reagir ao cancelamento feito pelo motor.

**Files:**
- Create: `app/src/shared/pin.ts`, `app/src/shared/pin.test.ts`
- Modify: `app/src/renderer/src/lib/copy.test.ts`, `app/src/shared/types.ts`, `app/src/shared/events.ts`, `app/src/shared/events.test.ts`, `app/src/main/core/machine.ts`, `app/src/main/core/machine.test.ts`, `app/src/main/core/controller.ts`, `app/src/main/core/controller.test.ts`, `app/src/main/engine/port.ts`, `app/src/main/engine/fake.ts`, `app/src/main/dev-demo.ts`, `app/src/renderer/src/screens/Approve.svelte`, `app/src/renderer/src/App.svelte`, `app/src/renderer/src/assets/main.css`

**Interfaces:**
- Produces:
  - `isValidPin(value: unknown): value is string` e `PIN_PATTERN` em `shared/pin.ts`
  - `AppState` com `{ screen: 'approve'; mode: 'send'; device: string; pairingId: string; pin: string | null }`
  - `AppEvent`: `{ type: 'PAIR_REQUEST'; device: string; pairingId: string; pin?: string }`, `{ type: 'PAIR_CANCELLED'; pairingId: string }`, `{ type: 'APPROVE'; pin?: string }`
  - `approvalPin(state, event): string | null` exportada de `machine.ts`
  - `PairRequest { device: string; pairingId: string; pin?: string }` e `ApproveRequest { pairingId: string; pin: string; name: string }` em `port.ts`
  - `EnginePort.approve(request: ApproveRequest)`, `EnginePort.deny(pairingId: string)`, `EnginePort.onPairRequest(cb: (request: PairRequest) => void)`, `EnginePort.onPairCancelled(cb: (pairingId: string) => void)`
  - `FakeEngine`: `simulatePairRequest(device, pairingId = 'p1', pin?)`, `simulatePairCancelled(pairingId)`, `lastApprove: ApproveRequest | null`, `lastDeny: string | null`

- [ ] **Step 1: Testes do PIN e dos eventos (RED)**

Crie `app/src/shared/pin.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isValidPin } from './pin'

describe('isValidPin', () => {
  it.each(['0000', '4821', '9999', '0042'])('aceita %s', (pin) => {
    expect(isValidPin(pin)).toBe(true)
  })

  it.each(['', '123', '12345', 'abcd', '12 3', ' 123', '12\n3', '１２３４', 1234, null, undefined, {}])(
    'rejeita %o',
    (pin) => {
      expect(isValidPin(pin)).toBe(false)
    }
  )
})
```

Em `app/src/shared/events.test.ts`, na lista de eventos aceitos acrescente:

```ts
    { type: 'APPROVE', pin: '0042' },
```

e na lista de rejeitados acrescente:

```ts
    { type: 'APPROVE', pin: '12' },
    { type: 'APPROVE', pin: '12345' },
    { type: 'APPROVE', pin: 4821 },
    { type: 'APPROVE', pin: 'abcd' },
    { type: 'PAIR_CANCELLED', pairingId: 'p1' },
```

- [ ] **Step 2: Testes da máquina (RED)**

Em `app/src/main/core/machine.test.ts`:

1. Troque a constante `approve` e acrescente `approveWithPin`:

```ts
const approve: AppState = {
  screen: 'approve',
  mode: 'send',
  device: 'Notebook',
  pairingId: 'p1',
  pin: null
}
const approveWithPin: AppState = { ...approve, pin: '4821' }
```

2. Na tabela do caminho feliz, troque as linhas de pareamento/aprovar/recusar por estas:

```ts
    ['pedido de pareamento', ready, { type: 'PAIR_REQUEST', device: 'Notebook', pairingId: 'p1' }, approve],
    [
      'pedido de pareamento já com o PIN',
      ready,
      { type: 'PAIR_REQUEST', device: 'Notebook', pairingId: 'p1', pin: '4821' },
      approveWithPin
    ],
    [
      'pedido com PIN inválido vira digitação manual',
      ready,
      { type: 'PAIR_REQUEST', device: 'Notebook', pairingId: 'p1', pin: 'zz' },
      approve
    ],
    ['aprovar digitando o PIN', approve, { type: 'APPROVE', pin: '4821' }, ready],
    ['aprovar com o PIN já conhecido', approveWithPin, { type: 'APPROVE' }, ready],
    ['recusar', approve, { type: 'DENY' }, ready],
    ['pedido cancelado pelo motor', approve, { type: 'PAIR_CANCELLED', pairingId: 'p1' }, ready],
```

3. Na tabela "eventos no estado errado são ignorados" corrija as linhas que usam `PAIR_REQUEST` (agora exigem `pairingId`) e acrescente os casos novos:

```ts
    ['pedido de pareamento durante uma conexão', connected, { type: 'PAIR_REQUEST', device: 'Intruso', pairingId: 'x' }],
    ['pedido de pareamento com outro já pendente', approve, { type: 'PAIR_REQUEST', device: 'Outro', pairingId: 'y' }],
    ['aprovar sem PIN', approve, { type: 'APPROVE' }],
    ['aprovar com PIN curto', approve, { type: 'APPROVE', pin: '12' }],
    ['aprovar com PIN que não é número', approve, { type: 'APPROVE', pin: 'abcd' }],
    ['cancelamento de outro pedido', approve, { type: 'PAIR_CANCELLED', pairingId: 'outro' }],
    ['cancelamento sem pedido', ready, { type: 'PAIR_CANCELLED', pairingId: 'p1' }],
```

(As demais linhas, como `aprovar sem pedido` com `ready`, ficam como estão.) Acrescente ainda um teste para a função auxiliar:

```ts
describe('approvalPin', () => {
  it('usa o PIN do evento, depois o do estado, e só se for válido', () => {
    expect(approvalPin(approve, { type: 'APPROVE', pin: '4821' })).toBe('4821')
    expect(approvalPin(approveWithPin, { type: 'APPROVE' })).toBe('4821')
    expect(approvalPin(approveWithPin, { type: 'APPROVE', pin: '1111' })).toBe('1111')
    expect(approvalPin(approve, { type: 'APPROVE' })).toBeNull()
    expect(approvalPin(approve, { type: 'APPROVE', pin: 'xx' })).toBeNull()
  })
})
```

Importe `approvalPin` junto de `reduce`: `import { approvalPin, reduce } from './machine'`.

- [ ] **Step 3: Testes do controlador e do motor de mentira (RED)**

Em `app/src/main/core/controller.test.ts`, onde há `{ screen: 'approve', mode: 'send', device: 'Notebook' }`, acrescente `pairingId: 'p1', pin: null` (todos os usos, incluindo os de "falhas tardias"). Depois:

1. No teste "instala, escolhe enviar, prepara, aprova e conecta", troque o trecho do pedido e da aprovação por:

```ts
    engine.simulatePairRequest('Notebook')
    expect(controller.getSnapshot().state).toEqual({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: null
    })

    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    expect(engine.lastApprove).toEqual({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    expect(screen(controller)).toBe('ready')
```

2. No teste "recusar avisa o motor" acrescente `expect(engine.lastDeny).toBe('p1')`.
3. Nos testes que mandam `{ type: 'APPROVE' }` a partir de um `approve` sem PIN (por exemplo "aprovar duas vezes", "falha tardia de aprovar", "falha de aprovar com o usuário ainda na tela"), passe `pin: '4821'` no evento.
4. Acrescente:

```ts
describe('pareamento com PIN', () => {
  it('aprovar sem PIN não chama o motor e não sai da tela', async () => {
    const { controller, engine } = await setup({
      screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: null
    })
    controller.dispatch({ type: 'APPROVE' })
    controller.dispatch({ type: 'APPROVE', pin: '12' })
    expect(screen(controller)).toBe('approve')
    expect(engine.calls).not.toContain('approve')
  })

  it('com o PIN já conhecido aprova sem digitar', async () => {
    const { controller, engine } = await setup({
      screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: '4821'
    })
    controller.dispatch({ type: 'APPROVE' })
    expect(engine.lastApprove).toEqual({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
  })

  it('o cancelamento do pedido volta para pronto sem chamar o motor', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    engine.simulatePairRequest('Notebook', 'p9')
    expect(screen(controller)).toBe('approve')
    engine.simulatePairCancelled('p9')
    expect(screen(controller)).toBe('ready')
    expect(engine.calls).not.toContain('deny')
    expect(engine.calls).not.toContain('approve')
  })

  it('o cancelamento de outro pedido é ignorado', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    engine.simulatePairRequest('Notebook', 'p9')
    engine.simulatePairCancelled('outro')
    expect(screen(controller)).toBe('approve')
  })
})
```

Em `app/src/renderer/src/lib/copy.test.ts`, nos usos de `{ screen: 'approve', mode: 'send', device: ... }` acrescente `pairingId: 'p1', pin: null` (só o tipo mudou; os textos esperados continuam iguais).

- [ ] **Step 4: Rodar e ver falhar**

```powershell
cd app
npx vitest run
```

Expected: FAIL em `pin.test.ts` (módulo não existe) e em vários casos de `events`, `machine` e `controller` (os eventos e estados novos ainda não existem).

- [ ] **Step 5: Implementar o PIN, os tipos e os eventos**

Crie `app/src/shared/pin.ts`:

```ts
export const PIN_PATTERN = /^\d{4}$/

/** O PIN do Sunshine tem sempre 4 dígitos. */
export function isValidPin(value: unknown): value is string {
  return typeof value === 'string' && PIN_PATTERN.test(value)
}
```

Em `app/src/shared/types.ts` troque as linhas do estado e dos eventos:

```ts
  | { screen: 'approve'; mode: 'send'; device: string; pairingId: string; pin: string | null }
```

```ts
  | { type: 'PAIR_REQUEST'; device: string; pairingId: string; pin?: string }
  | { type: 'PAIR_CANCELLED'; pairingId: string }
  | { type: 'APPROVE'; pin?: string }
```

(`APPROVE` deixa de estar na lista simples; remova a linha antiga `| { type: 'APPROVE' }`.)

Em `app/src/shared/events.ts` importe `isValidPin` e troque o `switch`: tire `'APPROVE'` do grupo de casos simples e acrescente

```ts
    case 'APPROVE':
      return candidate.pin === undefined || isValidPin(candidate.pin)
```

- [ ] **Step 6: Implementar a máquina e o controlador**

Em `app/src/main/core/machine.ts`: importe `isValidPin` de `'../../shared/pin'`, acrescente a função exportada

```ts
type ApproveState = Extract<AppState, { screen: 'approve' }>
type ApproveEvent = Extract<AppEvent, { type: 'APPROVE' }>

/** O PIN digitado vale mais que o já conhecido; qualquer um precisa ter 4 dígitos. */
export function approvalPin(state: ApproveState, event: ApproveEvent): string | null {
  const pin = event.pin ?? state.pin
  return pin !== null && isValidPin(pin) ? pin : null
}
```

e troque os casos `ready` e `approve` do `switch`:

```ts
    case 'ready':
      if (event.type === 'PAIR_REQUEST') {
        const pin = event.pin !== undefined && isValidPin(event.pin) ? event.pin : null
        return {
          screen: 'approve',
          mode: 'send',
          device: event.device,
          pairingId: event.pairingId,
          pin
        }
      }
      if (event.type === 'CLIENT_CONNECTED')
        return { screen: 'connected', mode: 'send', device: event.device }
      return state
    case 'approve':
      if (event.type === 'APPROVE') {
        return approvalPin(state, event) === null ? state : { screen: 'ready', mode: 'send' }
      }
      if (event.type === 'DENY') return { screen: 'ready', mode: 'send' }
      if (event.type === 'PAIR_CANCELLED') {
        return event.pairingId === state.pairingId ? { screen: 'ready', mode: 'send' } : state
      }
      return state
```

Em `app/src/main/engine/port.ts` acrescente os tipos e troque as assinaturas (a divisão em servidor e cliente é da Tarefa 2):

```ts
export interface PairRequest {
  device: string
  pairingId: string
  pin?: string
}

export interface ApproveRequest {
  pairingId: string
  pin: string
  name: string
}
```

```ts
  onPairRequest(callback: (request: PairRequest) => void): () => void
  onPairCancelled(callback: (pairingId: string) => void): () => void
```

```ts
  approve(request: ApproveRequest): Promise<void>
  deny(pairingId: string): Promise<void>
```

Em `app/src/main/core/controller.ts`: importe `approvalPin` e troque o efeito de `approve → ready`:

```ts
    if (prev.screen === 'approve' && next.screen === 'ready') {
      if (event.type === 'APPROVE') {
        const pin = approvalPin(prev, event)
        if (pin !== null) {
          engine
            .approve({ pairingId: prev.pairingId, pin, name: prev.device })
            .catch(failIfStill(next, 'Não consegui responder ao pedido.'))
        }
      } else if (event.type === 'DENY') {
        engine.deny(prev.pairingId).catch(failIfStill(next, 'Não consegui responder ao pedido.'))
      }
    }
```

e as assinaturas do motor:

```ts
  engine.onPairRequest((request) => dispatch({ type: 'PAIR_REQUEST', ...request }))
  engine.onPairCancelled((pairingId) => dispatch({ type: 'PAIR_CANCELLED', pairingId }))
```

Em `app/src/main/engine/fake.ts`: troque o emissor de pareamento por `emitter<[PairRequest]>()`, acrescente `private pairCancelled = emitter<[string]>()`, os campos `lastApprove: ApproveRequest | null = null` e `lastDeny: string | null = null`, e os métodos:

```ts
  async approve(request: ApproveRequest): Promise<void> {
    this.calls.push('approve')
    this.lastApprove = request
    await this.wait()
    if (this.failApprove) {
      const message = this.failApprove
      this.failApprove = null
      throw new Error(message)
    }
  }

  async deny(pairingId: string): Promise<void> {
    this.calls.push('deny')
    this.lastDeny = pairingId
  }

  onPairRequest(callback: (request: PairRequest) => void): () => void {
    return this.pair.on(callback)
  }

  onPairCancelled(callback: (pairingId: string) => void): () => void {
    return this.pairCancelled.on(callback)
  }

  simulatePairRequest(device: string, pairingId = 'p1', pin?: string): void {
    this.pair.emit({ device, pairingId, ...(pin === undefined ? {} : { pin }) })
  }

  simulatePairCancelled(pairingId: string): void {
    this.pairCancelled.emit(pairingId)
  }
```

Em `app/src/main/dev-demo.ts` troque a chamada do pedido por `engine.simulatePairRequest('Notebook', 'p1', '4821')` (o roteiro de demonstração simula o PIN já conhecido, como fará o nosso cliente).

- [ ] **Step 7: Tela Permitir com o campo do PIN**

Substitua `app/src/renderer/src/screens/Approve.svelte`:

```svelte
<script lang="ts">
  import { isValidPin } from '../../../shared/pin'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  interface Props {
    device: string
    pin: string | null
  }

  let { device, pin }: Props = $props()

  let typed = $state('')

  const copy = $derived(copyFor({ screen: 'approve', mode: 'send', device, pairingId: '', pin }))
  const ready = $derived(isValidPin(pin ?? typed))

  function approve(): void {
    if (!ready) return
    void send(pin === null ? { type: 'APPROVE', pin: typed } : { type: 'APPROVE' })
  }
</script>

<div class="badge" aria-hidden="true">
  <svg
    width="36"
    height="36"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="9" y="10" width="30" height="21" rx="3.5" /><path d="M4 37h40" />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title title-md">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
{#if pin === null}
  <div class="stack gap-xs">
    <label class="hint" for="pin">Digite o PIN que aparece no outro computador</label>
    <input
      id="pin"
      class="pin-input"
      inputmode="numeric"
      autocomplete="off"
      maxlength="4"
      value={typed}
      oninput={(event) => (typed = event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
      onkeydown={(event) => event.key === 'Enter' && approve()}
    />
  </div>
{/if}
<div class="stack gap-xs">
  <button class="btn btn-primary" disabled={!ready} onclick={approve}>Permitir</button>
  <button class="btn btn-ghost" onclick={() => send({ type: 'DENY' })}>Recusar</button>
</div>
<span class="hint-faint">{safeName(device)} · mesma rede</span>
```

Em `app/src/renderer/src/App.svelte` troque a linha do `approve` para passar o PIN:

```svelte
    <Frame><Approve device={state.device} pin={state.pin} /></Frame>
```

Em `app/src/renderer/src/assets/main.css` acrescente:

```css
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pin-input {
  width: 160px;
  height: 56px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
  color: var(--fg);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 0.4em;
  text-align: center;
}
```

- [ ] **Step 8: Rodar tudo e ver passar**

```powershell
cd app
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: tudo verde. Corrija com `npm run format` se o lint reclamar só de formatação.

- [ ] **Step 9: Provar com mutação**

Em `machine.ts`, troque temporariamente `return approvalPin(state, event) === null ? state : { screen: 'ready', mode: 'send' }` por `return { screen: 'ready', mode: 'send' }` e rode `npx vitest run src/main/core/machine.test.ts src/main/core/controller.test.ts`.

Expected: FAIL em "aprovar sem PIN", "aprovar com PIN curto", "aprovar com PIN que não é número" (máquina) e em "aprovar sem PIN não chama o motor e não sai da tela" (controlador). Desfaça e rode de novo: PASS.

- [ ] **Step 10: Verificar a tela no app**

```powershell
npm run build
```

Abra o app (`npm run dev`), siga até "Pronto." (o roteiro de demonstração manda o pedido com PIN conhecido, então o campo não aparece). Para ver o campo, no DevTools (`Ctrl+Shift+I`) rode `await window.horizonte.dispatch({ type: 'CHOOSE', mode: 'send' })` não ajuda; use o teste de unidade como prova do estado e confirme visualmente trocando em `dev-demo.ts` o PIN por `undefined` por um instante: deve aparecer "Digite o PIN...", o botão **Permitir** desabilitado até 4 dígitos, e só números aceitos. Desfaça a troca.

- [ ] **Step 11: Commit**

```powershell
cd ..
git add app/src
git commit -m "feat: pareamento com PIN e cancelamento no nucleo e na tela Permitir"
```

---

### Task 2: Porta do motor em dois papéis e composição

Servidor (Sunshine) e cliente (Moonlight) vão ter implementações separadas. A interface passa a refletir isso, e uma composição junta as duas.

**Files:**
- Modify: `app/src/main/engine/port.ts`, `app/src/main/engine/fake.ts`
- Create: `app/src/main/engine/compose.ts`
- Test: `app/src/main/engine/compose.test.ts`

**Interfaces:**
- Produces:
  - `ServerEngine` (prepare, abort, approve, deny, stopSending, applyBitrate, onPairRequest, onPairCancelled, onClientConnected, onClientDisconnected)
  - `ClientEngine` (listHosts, connect, disconnect, applyBitrate, onStreamEnded)
  - `EnginePort extends ServerEngine, ClientEngine {}`
  - `composeEngine(server: ServerEngine, client: ClientEngine): EnginePort`

- [ ] **Step 1: Teste da composição (RED)**

Crie `app/src/main/engine/compose.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { composeEngine } from './compose'
import { FakeEngine } from './fake'
import type { Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../core/settings'

const settings: Settings = { ...DEFAULT_SETTINGS }

describe('composeEngine', () => {
  it('manda o papel de servidor ao servidor e o de cliente ao cliente', async () => {
    const server = new FakeEngine(0)
    const client = new FakeEngine(0)
    const engine = composeEngine(server, client)

    await engine.prepare(() => undefined, settings)
    await engine.approve({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    await engine.deny('p2')
    await engine.stopSending()
    await engine.abort()
    await engine.listHosts()
    await engine.connect('192.168.1.3', settings)
    await engine.disconnect()

    expect(server.calls).toEqual(['prepare', 'approve', 'deny', 'stopSending', 'abort'])
    expect(client.calls).toEqual(['connect:192.168.1.3', 'disconnect'])
  })

  it('junta os eventos de cada lado', () => {
    const server = new FakeEngine(0)
    const client = new FakeEngine(0)
    const engine = composeEngine(server, client)
    const seen: string[] = []
    engine.onPairRequest((request) => seen.push(`pair:${request.pairingId}`))
    engine.onPairCancelled((id) => seen.push(`cancel:${id}`))
    engine.onClientConnected((device) => seen.push(`connected:${device}`))
    engine.onClientDisconnected(() => seen.push('disconnected'))
    engine.onStreamEnded(() => seen.push('ended'))

    server.simulatePairRequest('Notebook', 'p1')
    server.simulatePairCancelled('p1')
    server.simulateClientConnected('Notebook')
    server.simulateClientDisconnected()
    client.simulateStreamEnded()
    client.simulateClientConnected('ignorado')

    expect(seen).toEqual(['pair:p1', 'cancel:p1', 'connected:Notebook', 'disconnected', 'ended'])
  })

  it('quem cancela a assinatura deixa de receber', () => {
    const server = new FakeEngine(0)
    const engine = composeEngine(server, new FakeEngine(0))
    let count = 0
    const stop = engine.onPairRequest(() => count++)
    server.simulatePairRequest('A')
    stop()
    server.simulatePairRequest('B')
    expect(count).toBe(1)
  })

  it('o ajuste de bitrate vai aos dois lados e uma falha de um não derruba o outro', async () => {
    const server = new FakeEngine(0)
    const client = new FakeEngine(0)
    server.applyBitrate = async () => {
      throw new Error('servidor parado')
    }
    const engine = composeEngine(server, client)
    await expect(engine.applyBitrate(40)).resolves.toBeUndefined()
    expect(client.calls).toContain('bitrate:40')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/compose.test.ts
```

Expected: FAIL (`./compose` não existe).

- [ ] **Step 3: Dividir a interface**

Substitua `app/src/main/engine/port.ts`:

```ts
import type { Host, PrepStep, Settings } from '../../shared/types'

export interface PairRequest {
  device: string
  pairingId: string
  pin?: string
}

export interface ApproveRequest {
  pairingId: string
  pin: string
  name: string
}

/** Papel de quem envia a tela (Sunshine). */
export interface ServerEngine {
  prepare(onStep: (step: PrepStep) => void, settings: Settings): Promise<void>
  /**
   * Interrompe o que o modo enviar deixou em andamento (preparação, espera por conexão
   * ou pedido de pareamento pendente). Chamado ao sair desse modo sem ter conectado.
   */
  abort(): Promise<void>
  approve(request: ApproveRequest): Promise<void>
  deny(pairingId: string): Promise<void>
  stopSending(): Promise<void>
  applyBitrate(mbps: number): Promise<void>
  onPairRequest(callback: (request: PairRequest) => void): () => void
  onPairCancelled(callback: (pairingId: string) => void): () => void
  onClientConnected(callback: (device: string) => void): () => void
  onClientDisconnected(callback: () => void): () => void
}

/** Papel de quem recebe a tela (Moonlight). */
export interface ClientEngine {
  listHosts(): Promise<Host[]>
  connect(host: string, settings: Settings): Promise<void>
  disconnect(): Promise<void>
  applyBitrate(mbps: number): Promise<void>
  onStreamEnded(callback: () => void): () => void
}

/** Tudo que o núcleo precisa do motor. */
export interface EnginePort extends ServerEngine, ClientEngine {}
```

Crie `app/src/main/engine/compose.ts`:

```ts
import type { ClientEngine, EnginePort, ServerEngine } from './port'

/** Junta um servidor e um cliente numa só porta. O ajuste de bitrate vale para os dois lados. */
export function composeEngine(server: ServerEngine, client: ClientEngine): EnginePort {
  return {
    prepare: (onStep, settings) => server.prepare(onStep, settings),
    abort: () => server.abort(),
    approve: (request) => server.approve(request),
    deny: (pairingId) => server.deny(pairingId),
    stopSending: () => server.stopSending(),
    applyBitrate: async (mbps) => {
      await Promise.allSettled([server.applyBitrate(mbps), client.applyBitrate(mbps)])
    },
    onPairRequest: (callback) => server.onPairRequest(callback),
    onPairCancelled: (callback) => server.onPairCancelled(callback),
    onClientConnected: (callback) => server.onClientConnected(callback),
    onClientDisconnected: (callback) => server.onClientDisconnected(callback),
    listHosts: () => client.listHosts(),
    connect: (host, settings) => client.connect(host, settings),
    disconnect: () => client.disconnect(),
    onStreamEnded: (callback) => client.onStreamEnded(callback)
  }
}
```

`FakeEngine implements EnginePort` continua válido sem mudanças (ele já tem tudo).

- [ ] **Step 4: Rodar tudo e ver passar**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: tudo verde.

- [ ] **Step 5: Provar com mutação**

Em `compose.ts`, troque `await Promise.allSettled([...])` por `await Promise.all([server.applyBitrate(mbps), client.applyBitrate(mbps)])` e rode `npx vitest run src/main/engine/compose.test.ts`.

Expected: FAIL em "o ajuste de bitrate vai aos dois lados e uma falha de um não derruba o outro". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/main/engine
git commit -m "feat: porta do motor dividida em servidor e cliente com composicao"
```

---

### Task 3: Sunshine falso (HTTPS) para testes

Um servidor HTTPS que imita a parte da API que usamos, com falhas programáveis. É infraestrutura de teste, mas tem um teste próprio para não virar fonte de falso positivo.

**Files:**
- Create: `app/src/main/engine/sunshine/testing/localhost-cert.pem`, `app/src/main/engine/sunshine/testing/localhost-key.pem`, `app/src/main/engine/sunshine/testing/fake-sunshine.ts`, `.gitattributes` (na raiz do repositório)
- Test: `app/src/main/engine/sunshine/testing/fake-sunshine.test.ts`

**Interfaces:**
- Produces:
  - `startFakeSunshine(credentials: { username: string; password: string }): Promise<FakeSunshine>`
  - `FakeSunshine`: `basePort: number`, `pairings: { id: string; name: string; address: string }[]`, `config: Record<string, unknown>`, `acceptPin: string`, `submitted: { pairing_id: string; pin: string; name: string }[]`, `cancelled: string[]`, `closedApps: number`, `calls: string[]`, `delayMs: number`, `failNext: FailNext | null`, `rawPinResponse: unknown | null`, `close(): Promise<void>`
  - `type FailNext = { status: number; raw?: string } | { destroy: true } | { huge: true }`
  - O servidor **substitui** a configuração inteira em `POST /api/config` (pior caso), para provar que o cliente mescla.

- [ ] **Step 1: Gerar o certificado de teste**

Os arquivos são só para testes (CN=localhost, validade longa). O OpenSSL que acompanha o Git for Windows serve:

```powershell
$ssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
& $ssl version
New-Item -ItemType Directory -Force app\src\main\engine\sunshine\testing | Out-Null
& $ssl req -x509 -newkey rsa:2048 -nodes -days 36500 -subj "/CN=localhost" `
  -keyout app\src\main\engine\sunshine\testing\localhost-key.pem `
  -out app\src\main\engine\sunshine\testing\localhost-cert.pem
```

Expected: `OpenSSL 3.x` na primeira linha e os dois arquivos `.pem` criados. Na raiz do repositório crie `.gitattributes` com o conteúdo abaixo, para o Git não converter quebras de linha dos certificados:

```
*.pem -text
```

- [ ] **Step 2: Teste do servidor falso (RED)**

Crie `app/src/main/engine/sunshine/testing/fake-sunshine.test.ts`:

```ts
import https from 'node:https'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startFakeSunshine, type FakeSunshine } from './fake-sunshine'

let fake: FakeSunshine

function get(path: string, auth?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        host: '127.0.0.1',
        port: fake.basePort + 1,
        path,
        method: 'GET',
        rejectUnauthorized: false,
        headers: auth ? { Authorization: auth } : {}
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => (body += chunk))
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }))
      }
    )
    request.on('error', reject)
    request.end()
  })
}

const basic = (user: string, password: string): string =>
  'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')

beforeEach(async () => {
  fake = await startFakeSunshine({ username: 'horizonte', password: 'segredo-123' })
})

afterEach(async () => {
  await fake.close()
})

describe('fake sunshine', () => {
  it('responde a lista de pareamentos com as credenciais certas', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    const reply = await get('/api/pin', basic('horizonte', 'segredo-123'))
    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual({
      pairings: [{ id: 'p1', name: 'Notebook', address: '192.168.1.2' }]
    })
    expect(fake.calls).toEqual(['GET /api/pin'])
  })

  it('recusa sem credenciais e com senha errada', async () => {
    expect((await get('/api/pin')).status).toBe(401)
    expect((await get('/api/pin', basic('horizonte', 'errada'))).status).toBe(401)
  })

  it('devolve 404 para rotas que não conhece', async () => {
    expect((await get('/api/nada', basic('horizonte', 'segredo-123'))).status).toBe(404)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/testing/fake-sunshine.test.ts
```

Expected: FAIL (`./fake-sunshine` não existe).

- [ ] **Step 4: Implementar o servidor falso**

Crie `app/src/main/engine/sunshine/testing/fake-sunshine.ts`:

```ts
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

const here = (name: string): string => fileURLToPath(new URL(name, import.meta.url))

export type FailNext = { status: number; raw?: string } | { destroy: true } | { huge: true }

export interface FakePairing {
  id: string
  name: string
  address: string
}

export interface FakeSunshine {
  /** Porta base, como a do Sunshine real: a API fica em basePort + 1. */
  basePort: number
  pairings: FakePairing[]
  config: Record<string, unknown>
  acceptPin: string
  submitted: { pairing_id: string; pin: string; name: string }[]
  cancelled: string[]
  closedApps: number
  calls: string[]
  delayMs: number
  failNext: FailNext | null
  rawPinResponse: unknown | null
  close(): Promise<void>
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    request.on('end', () => resolve(body))
  })
}

function send(response: ServerResponse, status: number, body: unknown, raw?: string): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(raw ?? JSON.stringify(body))
}

/** Imita a parte da API do Sunshine que o Horizonte usa. O POST /api/config SUBSTITUI tudo, como no pior caso. */
export async function startFakeSunshine(credentials: {
  username: string
  password: string
}): Promise<FakeSunshine> {
  const expected =
    'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')

  const fake: FakeSunshine = {
    basePort: 0,
    pairings: [],
    config: {},
    acceptPin: '4821',
    submitted: [],
    cancelled: [],
    closedApps: 0,
    calls: [],
    delayMs: 0,
    failNext: null,
    rawPinResponse: null,
    close: () => closeServer()
  }

  const server: Server = createServer(
    { key: readFileSync(here('localhost-key.pem')), cert: readFileSync(here('localhost-cert.pem')) },
    (request, response) => {
      void handle(request, response)
    }
  )

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const route = `${request.method} ${request.url}`
    fake.calls.push(route)

    const failure = fake.failNext
    if (failure && 'destroy' in failure) {
      fake.failNext = null
      request.socket.destroy()
      return
    }
    if (fake.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, fake.delayMs))
    if (request.headers.authorization !== expected) return send(response, 401, { error: 'unauthorized' })

    if (failure) {
      fake.failNext = null
      if ('huge' in failure) return send(response, 200, null, '{"x":"' + 'a'.repeat(2_000_000) + '"}')
      return send(response, failure.status, {}, failure.raw)
    }

    const body = request.method === 'GET' ? '' : await readBody(request)
    const json = body ? (JSON.parse(body) as Record<string, unknown>) : {}

    switch (route) {
      case 'GET /api/pin':
        return send(response, 200, fake.rawPinResponse ?? { pairings: fake.pairings })
      case 'POST /api/pin': {
        const submitted = json as { pairing_id: string; pin: string; name: string }
        fake.submitted.push(submitted)
        const known = fake.pairings.some((pairing) => pairing.id === submitted.pairing_id)
        const ok = known && submitted.pin === fake.acceptPin
        if (ok) fake.pairings = fake.pairings.filter((pairing) => pairing.id !== submitted.pairing_id)
        return send(response, 200, { status: ok })
      }
      case 'DELETE /api/pin': {
        const id = String(json.pairing_id)
        fake.cancelled.push(id)
        fake.pairings = fake.pairings.filter((pairing) => pairing.id !== id)
        return send(response, 200, { status: true })
      }
      case 'GET /api/config':
        return send(response, 200, fake.config)
      case 'POST /api/config':
        fake.config = json
        return send(response, 200, { status: true })
      case 'POST /api/restart':
        return send(response, 200, { status: true })
      case 'POST /api/apps/close':
        fake.closedApps++
        return send(response, 200, { status: true })
      default:
        return send(response, 404, { error: 'not found' })
    }
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fake.basePort = (server.address() as AddressInfo).port - 1

  function closeServer(): Promise<void> {
    return new Promise((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  }

  return fake
}
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine/testing/fake-sunshine.test.ts
npm run lint
npm run typecheck
```

Expected: PASS (3 testes); lint e tipos sem erro. O `import.meta.url` funciona no Vitest; se o `typecheck:node` reclamar de `import.meta`, confirme que `tsconfig.node.json` herda `module: "esnext"` (herda de `@electron-toolkit/tsconfig`).

- [ ] **Step 6: Commit**

```powershell
cd ..
git add .gitattributes app/src/main/engine/sunshine/testing
git commit -m "test: servidor HTTPS falso que imita a API do Sunshine"
```

---

### Task 4: Cliente da API do Sunshine

**Files:**
- Create: `app/src/main/engine/sunshine/api.ts`
- Test: `app/src/main/engine/sunshine/api.test.ts`

**Interfaces:**
- Consumes: `startFakeSunshine`, `FakeSunshine` (Tarefa 3).
- Produces:
  - `SunshineApiErrorKind = 'unreachable' | 'unauthorized' | 'server' | 'timeout' | 'invalid-response'`
  - `class SunshineApiError extends Error { kind: SunshineApiErrorKind; status?: number }`
  - `interface Pairing { id: string; name: string; address: string }`
  - `interface SunshineApiOptions { port: number; username: string; password: string; host?: string; timeoutMs?: number }`
  - `class SunshineApi` com `listPairings(): Promise<Pairing[]>`, `submitPin(request: { pairingId: string; pin: string; name: string }): Promise<boolean>`, `cancelPairing(pairingId: string): Promise<void>`, `getConfig(): Promise<Record<string, unknown>>`, `saveConfig(patch: Record<string, string>): Promise<void>` (lê, mescla e grava), `restart(): Promise<void>`, `closeApp(): Promise<void>`
  - `type SunshineApiPort = Pick<SunshineApi, 'listPairings' | 'submitPin' | 'cancelPairing' | 'getConfig' | 'saveConfig' | 'restart' | 'closeApp'>`

- [ ] **Step 1: Testes (RED)**

Crie `app/src/main/engine/sunshine/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SunshineApi, SunshineApiError } from './api'
import { startFakeSunshine, type FakeSunshine } from './testing/fake-sunshine'

const PASSWORD = 'segredo-123'
let fake: FakeSunshine
let api: SunshineApi

beforeEach(async () => {
  fake = await startFakeSunshine({ username: 'horizonte', password: PASSWORD })
  api = new SunshineApi({
    port: fake.basePort,
    username: 'horizonte',
    password: PASSWORD,
    timeoutMs: 300
  })
})

afterEach(async () => {
  await fake.close()
})

async function failureOf(promise: Promise<unknown>): Promise<SunshineApiError> {
  try {
    await promise
  } catch (cause) {
    if (cause instanceof SunshineApiError) return cause
    throw cause
  }
  throw new Error('esperava uma falha')
}

describe('pareamentos', () => {
  it('lista os pedidos pendentes', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    expect(await api.listPairings()).toEqual([{ id: 'p1', name: 'Notebook', address: '192.168.1.2' }])
  })

  it('ignora itens malformados da lista', async () => {
    fake.rawPinResponse = { pairings: [{ id: 'a' }, 5, null, { name: 'sem id' }, { id: 7, name: 'n' }] }
    expect(await api.listPairings()).toEqual([
      { id: 'a', name: '', address: '' },
      { id: '7', name: 'n', address: '' }
    ])
  })

  it('uma resposta sem a lista é inválida', async () => {
    fake.rawPinResponse = { outra: 'coisa' }
    expect((await failureOf(api.listPairings())).kind).toBe('invalid-response')
  })

  it('manda o PIN no formato do Sunshine e devolve verdadeiro quando confere', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    expect(await api.submitPin({ pairingId: 'p1', pin: '4821', name: 'Notebook' })).toBe(true)
    expect(fake.submitted).toEqual([{ pairing_id: 'p1', pin: '4821', name: 'Notebook' }])
  })

  it('devolve falso quando o PIN não confere', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    expect(await api.submitPin({ pairingId: 'p1', pin: '0000', name: 'Notebook' })).toBe(false)
  })

  it('cancela um pedido', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await api.cancelPairing('p1')
    expect(fake.cancelled).toEqual(['p1'])
    expect(await api.listPairings()).toEqual([])
  })
})

describe('configuração', () => {
  it('lê a configuração', async () => {
    fake.config = { output_name: 'abc', sunshine_name: 'Desktop' }
    expect(await api.getConfig()).toEqual({ output_name: 'abc', sunshine_name: 'Desktop' })
  })

  it('gravar um trecho nunca apaga o resto da configuração', async () => {
    fake.config = { output_name: 'abc', sunshine_name: 'Desktop', amd_rc: 'cbr' }
    await api.saveConfig({ amd_usage: 'transcoding' })
    expect(fake.config).toEqual({
      output_name: 'abc',
      sunshine_name: 'Desktop',
      amd_rc: 'cbr',
      amd_usage: 'transcoding'
    })
  })

  it('o trecho novo vence o valor antigo', async () => {
    fake.config = { sunshine_name: 'Desktop' }
    await api.saveConfig({ sunshine_name: 'Sala' })
    expect(fake.config).toEqual({ sunshine_name: 'Sala' })
  })

  it('valores que não são texto na configuração voltam como vieram', async () => {
    fake.config = { lista: ['a', 'b'], ligado: true }
    await api.saveConfig({ x: '1' })
    expect(fake.config).toEqual({ lista: ['a', 'b'], ligado: true, x: '1' })
  })
})

describe('outras chamadas', () => {
  it('fecha o aplicativo em execução', async () => {
    await api.closeApp()
    expect(fake.closedApps).toBe(1)
  })

  it('reiniciar tolera a conexão caindo no meio', async () => {
    fake.failNext = { destroy: true }
    await expect(api.restart()).resolves.toBeUndefined()
  })

  it('reiniciar tolera o tempo esgotado', async () => {
    fake.delayMs = 1000
    await expect(api.restart()).resolves.toBeUndefined()
  })
})

describe('falhas', () => {
  it('senha errada vira "unauthorized" e a senha nunca aparece na mensagem', async () => {
    const wrong = new SunshineApi({ port: fake.basePort, username: 'horizonte', password: 'errada-999', timeoutMs: 300 })
    const error = await failureOf(wrong.listPairings())
    expect(error.kind).toBe('unauthorized')
    expect(error.status).toBe(401)
    expect(error.message).not.toContain('errada-999')
    expect(error.message).not.toContain(PASSWORD)
    expect(String(error.stack)).not.toContain('errada-999')
  })

  it('porta fechada vira "unreachable"', async () => {
    await fake.close()
    expect((await failureOf(api.listPairings())).kind).toBe('unreachable')
  })

  it('conexão derrubada no meio vira "unreachable"', async () => {
    fake.failNext = { destroy: true }
    expect((await failureOf(api.listPairings())).kind).toBe('unreachable')
  })

  it('servidor lento vira "timeout"', async () => {
    fake.delayMs = 1000
    expect((await failureOf(api.listPairings())).kind).toBe('timeout')
  })

  it('erro 500 vira "server" com o status', async () => {
    fake.failNext = { status: 500 }
    const error = await failureOf(api.listPairings())
    expect(error.kind).toBe('server')
    expect(error.status).toBe(500)
  })

  it('resposta que não é JSON vira "invalid-response"', async () => {
    fake.failNext = { status: 200, raw: '<html>oi</html>' }
    expect((await failureOf(api.listPairings())).kind).toBe('invalid-response')
  })

  it('resposta gigante vira "invalid-response" sem estourar a memória', async () => {
    fake.failNext = { huge: true }
    expect((await failureOf(api.listPairings())).kind).toBe('invalid-response')
  })

  it('PIN com resposta sem status é tratado como não confere', async () => {
    fake.failNext = { status: 200, raw: '{}' }
    expect(await api.submitPin({ pairingId: 'p1', pin: '4821', name: 'x' })).toBe(false)
  })
})

describe('segurança do destino', () => {
  it.each(['192.168.1.9', 'exemplo.com', '0.0.0.0', ''])('recusa o endereço %s', (host) => {
    expect(() => new SunshineApi({ port: 47989, username: 'u', password: 'p', host })).toThrow()
  })

  it.each(['127.0.0.1', 'localhost', '::1'])('aceita o endereço de loopback %s', (host) => {
    expect(() => new SunshineApi({ port: 47989, username: 'u', password: 'p', host })).not.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/api.test.ts
```

Expected: FAIL (`./api` não existe).

- [ ] **Step 3: Implementar**

Crie `app/src/main/engine/sunshine/api.ts`:

```ts
import https from 'node:https'
import type { IncomingMessage } from 'node:http'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])
const MAX_BODY_BYTES = 1_000_000

export type SunshineApiErrorKind =
  | 'unreachable'
  | 'unauthorized'
  | 'server'
  | 'timeout'
  | 'invalid-response'

export class SunshineApiError extends Error {
  constructor(
    readonly kind: SunshineApiErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'SunshineApiError'
  }
}

export interface Pairing {
  id: string
  name: string
  address: string
}

export interface SunshineApiOptions {
  /** Porta base do Sunshine (47989 por padrão). A API fica em porta + 1. */
  port: number
  username: string
  password: string
  host?: string
  timeoutMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class SunshineApi {
  private readonly agent = new https.Agent({ rejectUnauthorized: false })
  private readonly host: string
  private readonly webPort: number
  private readonly authorization: string
  private readonly timeoutMs: number

  constructor(options: SunshineApiOptions) {
    const host = options.host ?? '127.0.0.1'
    if (!LOOPBACK.has(host)) {
      throw new Error('A API do Sunshine só pode ser acessada no próprio computador.')
    }
    this.host = host
    this.webPort = options.port + 1
    this.timeoutMs = options.timeoutMs ?? 5000
    this.authorization =
      'Basic ' + Buffer.from(`${options.username}:${options.password}`).toString('base64')
  }

  async listPairings(): Promise<Pairing[]> {
    const data = await this.request('GET', '/api/pin')
    if (!isRecord(data) || !Array.isArray(data.pairings)) {
      throw new SunshineApiError('invalid-response', 'O Sunshine mandou uma lista de pareamentos inesperada.')
    }
    return data.pairings.flatMap((item: unknown): Pairing[] => {
      if (!isRecord(item)) return []
      if (typeof item.id !== 'string' && typeof item.id !== 'number') return []
      return [
        {
          id: String(item.id),
          name: typeof item.name === 'string' ? item.name : '',
          address: typeof item.address === 'string' ? item.address : ''
        }
      ]
    })
  }

  async submitPin(request: { pairingId: string; pin: string; name: string }): Promise<boolean> {
    const data = await this.request('POST', '/api/pin', {
      pairing_id: request.pairingId,
      pin: request.pin,
      name: request.name
    })
    return isRecord(data) && data.status === true
  }

  async cancelPairing(pairingId: string): Promise<void> {
    await this.request('DELETE', '/api/pin', { pairing_id: pairingId })
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const data = await this.request('GET', '/api/config')
    if (!isRecord(data)) {
      throw new SunshineApiError('invalid-response', 'O Sunshine mandou uma configuração inesperada.')
    }
    return data
  }

  /**
   * O Sunshine pode tratar o corpo como a configuração inteira. Por isso lemos tudo,
   * mesclamos o trecho novo por cima e gravamos o conjunto, sem nunca apagar o resto.
   */
  async saveConfig(patch: Record<string, string>): Promise<void> {
    const current = await this.getConfig()
    await this.request('POST', '/api/config', { ...current, ...patch })
  }

  /** O reinício derruba a própria conexão; isso não é falha. */
  async restart(): Promise<void> {
    try {
      await this.request('POST', '/api/restart', {})
    } catch (cause) {
      if (cause instanceof SunshineApiError && (cause.kind === 'unreachable' || cause.kind === 'timeout')) {
        return
      }
      throw cause
    }
  }

  async closeApp(): Promise<void> {
    await this.request('POST', '/api/apps/close', {})
  }

  private request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body)
      const request = https.request(
        {
          host: this.host,
          port: this.webPort,
          path,
          method,
          agent: this.agent,
          headers: {
            Authorization: this.authorization,
            ...(payload === undefined
              ? {}
              : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
          }
        },
        (response) => this.collect(response, resolve, reject)
      )
      request.setTimeout(this.timeoutMs, () => {
        request.destroy(new SunshineApiError('timeout', 'O Sunshine não respondeu a tempo.'))
      })
      request.on('error', (cause) => {
        reject(
          cause instanceof SunshineApiError
            ? cause
            : new SunshineApiError('unreachable', 'Não consegui falar com o Sunshine.')
        )
      })
      if (payload !== undefined) request.write(payload)
      request.end()
    })
  }

  private collect(
    response: IncomingMessage,
    resolve: (value: unknown) => void,
    reject: (cause: SunshineApiError) => void
  ): void {
    const chunks: Buffer[] = []
    let size = 0
    response.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        response.destroy()
        reject(new SunshineApiError('invalid-response', 'O Sunshine mandou uma resposta grande demais.'))
        return
      }
      chunks.push(chunk)
    })
    response.on('error', () => reject(new SunshineApiError('unreachable', 'A conexão com o Sunshine caiu.')))
    response.on('end', () => {
      const status = response.statusCode ?? 0
      if (status === 401 || status === 403) {
        reject(new SunshineApiError('unauthorized', 'O Sunshine recusou o usuário ou a senha.', status))
        return
      }
      if (status < 200 || status >= 300) {
        reject(new SunshineApiError('server', `O Sunshine respondeu com o erro ${status}.`, status))
        return
      }
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new SunshineApiError('invalid-response', 'O Sunshine mandou uma resposta ilegível.', status))
      }
    })
  }
}

export type SunshineApiPort = Pick<
  SunshineApi,
  'listPairings' | 'submitPin' | 'cancelPairing' | 'getConfig' | 'saveConfig' | 'restart' | 'closeApp'
>
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine/api.test.ts
npm run lint
npm run typecheck
```

Expected: PASS em todos os casos. Se algum caso de tempo oscilar, aumente o `timeoutMs` de 300 e o `delayMs` de 1000 de forma proporcional.

- [ ] **Step 5: Provar com mutação**

1. Em `saveConfig`, troque `{ ...current, ...patch }` por `patch` e rode `npx vitest run src/main/engine/sunshine/api.test.ts`. Expected: FAIL em "gravar um trecho nunca apaga o resto da configuração" e "valores que não são texto...". Desfaça.
2. No construtor, apague a verificação `if (!LOOPBACK.has(host))` e rode de novo. Expected: FAIL em "recusa o endereço ...". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/main/engine/sunshine/api.ts app/src/main/engine/sunshine/api.test.ts
git commit -m "feat: cliente da API do Sunshine com tratamento de falhas"
```

---

### Task 5: Vigia de pareamentos

**Files:**
- Create: `app/src/main/engine/sunshine/pairing-watcher.ts`
- Test: `app/src/main/engine/sunshine/pairing-watcher.test.ts`

**Interfaces:**
- Consumes: `Pairing` (Tarefa 4).
- Produces:
  - `interface PairingWatcherOptions { api: { listPairings(): Promise<Pairing[]> }; intervalMs?: number; maxBackoffMs?: number; onRequest(pairing: Pairing): void; onCancelled(pairingId: string): void; onError?(cause: unknown): void }`
  - `interface PairingWatcher { start(): void; stop(): void }`
  - `createPairingWatcher(options: PairingWatcherOptions): PairingWatcher`

- [ ] **Step 1: Testes (RED)**

Crie `app/src/main/engine/sunshine/pairing-watcher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPairingWatcher } from './pairing-watcher'
import type { Pairing } from './api'

const notebook: Pairing = { id: 'p1', name: 'Notebook', address: '192.168.1.2' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(responses: Array<Pairing[] | Error | 'pending'>) {
  const requests: Pairing[] = []
  const cancelled: string[] = []
  const errors: unknown[] = []
  let calls = 0
  let release: ((list: Pairing[]) => void) | null = null
  const api = {
    listPairings: (): Promise<Pairing[]> => {
      const response = responses[Math.min(calls, responses.length - 1)]
      calls++
      if (response === 'pending') {
        return new Promise((resolve) => {
          release = resolve
        })
      }
      if (response instanceof Error) return Promise.reject(response)
      return Promise.resolve(response)
    }
  }
  const watcher = createPairingWatcher({
    api,
    intervalMs: 100,
    maxBackoffMs: 400,
    onRequest: (pairing) => requests.push(pairing),
    onCancelled: (id) => cancelled.push(id),
    onError: (cause) => errors.push(cause)
  })
  return {
    watcher,
    requests,
    cancelled,
    errors,
    calls: () => calls,
    release: (list: Pairing[]) => release?.(list)
  }
}

describe('createPairingWatcher', () => {
  it('avisa uma vez só de um pedido que aparece em várias consultas', async () => {
    const t = setup([[notebook]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(t.requests).toEqual([notebook])
    expect(t.calls()).toBeGreaterThan(2)
    t.watcher.stop()
  })

  it('avisa o cancelamento quando o pedido some', async () => {
    const t = setup([[notebook], []])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests).toEqual([notebook])
    expect(t.cancelled).toEqual(['p1'])
    t.watcher.stop()
  })

  it('o mesmo identificador voltando depois de sumir é um pedido novo', async () => {
    const t = setup([[notebook], [], [notebook]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(t.requests).toEqual([notebook, notebook])
    t.watcher.stop()
  })

  it('uma consulta lenta não se sobrepõe à seguinte', async () => {
    const t = setup(['pending'])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.calls()).toBe(1)
    t.release([notebook])
    await vi.advanceTimersByTimeAsync(0)
    expect(t.requests).toEqual([notebook])
    t.watcher.stop()
  })

  it('erros não param a vigilância e o intervalo cresce até o limite', async () => {
    const t = setup([new Error('fora do ar')])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls()).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(t.calls()).toBe(2)
    await vi.advanceTimersByTimeAsync(400)
    expect(t.calls()).toBe(3)
    await vi.advanceTimersByTimeAsync(400)
    expect(t.calls()).toBe(4)
    expect(t.errors).toHaveLength(4)
    t.watcher.stop()
  })

  it('depois de um erro, uma consulta boa volta ao ritmo normal', async () => {
    const t = setup([new Error('x'), [notebook]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(t.requests).toEqual([notebook])
    const before = t.calls()
    await vi.advanceTimersByTimeAsync(100)
    expect(t.calls()).toBe(before + 1)
    t.watcher.stop()
  })

  it('parar com uma consulta em andamento ignora o resultado dela', async () => {
    const t = setup(['pending'])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    t.watcher.stop()
    t.release([notebook])
    await vi.advanceTimersByTimeAsync(500)
    expect(t.requests).toEqual([])
    expect(t.calls()).toBe(1)
  })

  it('um callback que lança não derruba a vigilância', async () => {
    const errors: unknown[] = []
    let calls = 0
    const watcher = createPairingWatcher({
      api: {
        listPairings: async () => {
          calls++
          return [notebook]
        }
      },
      intervalMs: 100,
      onRequest: () => {
        throw new Error('callback quebrado')
      },
      onCancelled: () => undefined,
      onError: (cause) => errors.push(cause)
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(calls).toBeGreaterThan(2)
    expect(errors).toHaveLength(1)
    watcher.stop()
  })

  it('começar duas vezes não duplica as consultas', async () => {
    const t = setup([[]])
    t.watcher.start()
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls()).toBe(1)
    t.watcher.stop()
  })

  it('depois de parar, nada mais é consultado', async () => {
    const t = setup([[]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(250)
    t.watcher.stop()
    const before = t.calls()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.calls()).toBe(before)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/pairing-watcher.test.ts
```

Expected: FAIL (`./pairing-watcher` não existe).

- [ ] **Step 3: Implementar**

Crie `app/src/main/engine/sunshine/pairing-watcher.ts`:

```ts
import type { Pairing } from './api'

export interface PairingWatcherOptions {
  api: { listPairings(): Promise<Pairing[]> }
  intervalMs?: number
  maxBackoffMs?: number
  onRequest(pairing: Pairing): void
  onCancelled(pairingId: string): void
  onError?(cause: unknown): void
}

export interface PairingWatcher {
  start(): void
  stop(): void
}

/** Consulta os pedidos de pareamento em série (nunca duas consultas ao mesmo tempo). */
export function createPairingWatcher(options: PairingWatcherOptions): PairingWatcher {
  const interval = options.intervalMs ?? 2000
  const maxBackoff = options.maxBackoffMs ?? 10_000
  const known = new Map<string, Pairing>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let run = 0
  let failures = 0

  const report = (cause: unknown): void => {
    try {
      options.onError?.(cause)
    } catch {
      // quem escuta o erro também falhou; não há mais o que fazer
    }
  }

  const guarded = (callback: () => void): void => {
    try {
      callback()
    } catch (cause) {
      report(cause)
    }
  }

  function schedule(token: number, delay: number): void {
    if (token !== run) return
    timer = setTimeout(() => void poll(token), delay)
  }

  async function poll(token: number): Promise<void> {
    let list: Pairing[]
    try {
      list = await options.api.listPairings()
    } catch (cause) {
      if (token !== run) return
      failures++
      report(cause)
      schedule(token, Math.min(interval * 2 ** failures, maxBackoff))
      return
    }
    if (token !== run) return
    failures = 0

    const present = new Set(list.map((pairing) => pairing.id))
    for (const pairing of list) {
      if (known.has(pairing.id)) continue
      known.set(pairing.id, pairing)
      guarded(() => options.onRequest(pairing))
    }
    for (const id of [...known.keys()]) {
      if (present.has(id)) continue
      known.delete(id)
      guarded(() => options.onCancelled(id))
    }
    schedule(token, interval)
  }

  return {
    start() {
      if (active) return
      active = true
      void poll(++run)
    },
    stop() {
      active = false
      run++
      known.clear()
      failures = 0
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine/pairing-watcher.test.ts
npm run lint
npm run typecheck
```

Expected: PASS nos 10 casos. Se "erros não param a vigilância" oscilar por causa do número de avanços de relógio, ajuste os avanços para refletir o recuo `min(interval * 2^falhas, limite)` (200, 400, 400 ms com intervalo de 100 ms).

- [ ] **Step 5: Provar com mutação**

Em `poll`, apague a linha `if (token !== run) return` que vem logo depois do `await` bem-sucedido (a segunda) e rode `npx vitest run src/main/engine/sunshine/pairing-watcher.test.ts`.

Expected: FAIL em "parar com uma consulta em andamento ignora o resultado dela". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/main/engine/sunshine/pairing-watcher.ts app/src/main/engine/sunshine/pairing-watcher.test.ts
git commit -m "feat: vigia de pedidos de pareamento do Sunshine"
```

---

### Task 6: Leitura do log do Sunshine

Funções puras sobre o texto do log, mais a leitura segura do arquivo (só a cauda, nunca estoura a memória).

**Files:**
- Create: `app/src/main/engine/sunshine/log.ts`, `app/src/main/engine/sunshine/log-file.ts`, `app/src/main/engine/sunshine/testing/log-samples.ts`
- Test: `app/src/main/engine/sunshine/log.test.ts`, `app/src/main/engine/sunshine/log-file.test.ts`

**Interfaces:**
- Produces:
  - `interface SunshineDisplay { deviceId: string; displayName: string; friendlyName: string; width: number; height: number; primary: boolean; originX: number }`
  - `interface FoundEncoder { name: string; backend: string; hardware: boolean }`
  - `parseFoundEncoder(log: string): FoundEncoder | null`
  - `parseDisplays(log: string): SunshineDisplay[]`
  - `isStartupComplete(log: string): boolean`, `countStartups(log: string): number`, `logSignature(log: string): string`
  - `countSessionEvents(log: string): { connected: number; disconnected: number }`
  - `readLogTail(path: string, maxBytes?: number): Promise<string>` (devolve `''` se o arquivo não existir)
  - `testing/log-samples.ts`: `STARTUP_SOFTWARE_LOG`, `STARTUP_AMF_LOG`, `DISPLAYS_BLOCK` (trechos reais de 02/10/2026)

- [ ] **Step 1: Amostras reais do log**

Crie `app/src/main/engine/sunshine/testing/log-samples.ts` (trechos reais do `sunshine.log`, reduzidos):

```ts
export const DISPLAYS_BLOCK = `[2026-10-02 16:54:52.472]: Info: Currently available display devices:
[
  {
    "device_id": "{5eb52002-659f-5729-bdd8-9cdc4efd1bf5}",
    "display_name": "\\\\\\\\.\\\\DISPLAY40",
    "edid": {
      "manufacturer_id": "MTT",
      "product_code": "1337",
      "serial_number": 518463207
    },
    "friendly_name": "VDD by MTT",
    "info": {
      "hdr_state": "Disabled",
      "origin_point": { "x": 1920, "y": 0 },
      "primary": false,
      "refresh_rate": { "type": "rational", "value": { "denominator": 1, "numerator": 60 } },
      "resolution": { "height": 1080, "width": 1920 },
      "resolution_scale": { "type": "rational", "value": { "denominator": 100, "numerator": 100 } }
    }
  },
  {
    "device_id": "{e1034c27-4b10-5e8d-aede-ee559334a996}",
    "display_name": "\\\\\\\\.\\\\DISPLAY1",
    "edid": { "manufacturer_id": "AOC", "product_code": "2402", "serial_number": 105 },
    "friendly_name": "24G2W1G4",
    "info": {
      "hdr_state": null,
      "origin_point": { "x": 0, "y": 0 },
      "primary": true,
      "refresh_rate": { "type": "rational", "value": { "denominator": 1001, "numerator": 60000 } },
      "resolution": { "height": 1080, "width": 1920 },
      "resolution_scale": { "type": "rational", "value": { "denominator": 100, "numerator": 100 } }
    }
  }
]
`

export const STARTUP_SOFTWARE_LOG = `[2026-10-02 17:10:53.957]: Info: Sunshine version: 2026.914.233613 commit: 63d35f702ee9e362e43263742981836ec0710384
[2026-10-02 17:10:53.958]: Info: Package Publisher: LizardByte
${DISPLAYS_BLOCK}[2026-10-02 17:11:17.657]: Info: // Testing for available encoders, this may generate errors. You can safely ignore those errors. //
[2026-10-02 17:11:17.660]: Info: Trying encoder [nvenc]
[2026-10-02 17:11:17.938]: Info: Encoder [nvenc] is not supported on this GPU
[2026-10-02 17:11:18.094]: Info: Trying encoder [amdvce]
[2026-10-02 17:11:18.496]: Info: Encoder [amdvce] failed
[2026-10-02 17:11:18.653]: Info: Trying encoder [software]
[2026-10-02 17:11:19.765]: Info: Found H.264 encoder: libx264 [software]
[2026-10-02 17:11:19.774]: Info: Configuration UI available at [https://localhost:47990]
`

export const STARTUP_AMF_LOG = `[2026-10-02 17:20:00.000]: Info: Sunshine version: 2026.914.233613 commit: 63d35f702ee9e362e43263742981836ec0710384
${DISPLAYS_BLOCK}[2026-10-02 17:21:46.911]: Info: // Testing for available encoders, this may generate errors. You can safely ignore those errors. //
[2026-10-02 17:21:47.200]: Info: Trying encoder [amdvce]
[2026-10-02 17:21:49.033]: Info: Found H.264 encoder: h264_amf [amdvce]
[2026-10-02 17:21:49.033]: Info: Found HEVC encoder: hevc_amf [amdvce]
[2026-10-02 17:21:49.034]: Info: Configuration UI available at [https://localhost:47990]
[2026-10-02 17:21:49.186]: Info: CLIENT CONNECTED
`
```

(`DISPLAYS_BLOCK` guarda o nome do monitor com barras invertidas como o Sunshine as escreve em JSON: `\\\\.\\DISPLAY40` no texto do log. Dentro do template literal acima isso exige barras duplicadas; o teste confere o valor resultante.)

- [ ] **Step 2: Testes (RED)**

Crie `app/src/main/engine/sunshine/log.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  countSessionEvents,
  countStartups,
  isStartupComplete,
  logSignature,
  parseDisplays,
  parseFoundEncoder
} from './log'
import { DISPLAYS_BLOCK, STARTUP_AMF_LOG, STARTUP_SOFTWARE_LOG } from './testing/log-samples'

describe('parseFoundEncoder', () => {
  it('reconhece o encoder de GPU', () => {
    expect(parseFoundEncoder(STARTUP_AMF_LOG)).toEqual({
      name: 'h264_amf',
      backend: 'amdvce',
      hardware: true
    })
  })

  it('reconhece o encoder por software como não sendo de hardware', () => {
    expect(parseFoundEncoder(STARTUP_SOFTWARE_LOG)).toEqual({
      name: 'libx264',
      backend: 'software',
      hardware: false
    })
  })

  it('usa só a última execução quando o log tem várias', () => {
    expect(parseFoundEncoder(STARTUP_AMF_LOG + STARTUP_SOFTWARE_LOG)?.hardware).toBe(false)
    expect(parseFoundEncoder(STARTUP_SOFTWARE_LOG + STARTUP_AMF_LOG)?.hardware).toBe(true)
  })

  it('um teste de encoder ainda em andamento ainda não tem resultado', () => {
    const emAndamento = `[x]: Info: // Testing for available encoders, this may generate errors. //
[x]: Info: Trying encoder [amdvce]
`
    expect(parseFoundEncoder(STARTUP_AMF_LOG + emAndamento)).toBeNull()
  })

  it('log vazio, sem a seção ou com lixo vira nulo, nunca exceção', () => {
    expect(parseFoundEncoder('')).toBeNull()
    expect(parseFoundEncoder('nada a ver')).toBeNull()
    expect(parseFoundEncoder('Testing for available encoders\nFound H.264 encoder: [')).toBeNull()
  })
})

describe('parseDisplays', () => {
  it('lê os monitores da última listagem', () => {
    const displays = parseDisplays(STARTUP_SOFTWARE_LOG)
    expect(displays).toHaveLength(2)
    expect(displays[0]).toEqual({
      deviceId: '{5eb52002-659f-5729-bdd8-9cdc4efd1bf5}',
      displayName: '\\\\.\\DISPLAY40',
      friendlyName: 'VDD by MTT',
      width: 1920,
      height: 1080,
      primary: false,
      originX: 1920
    })
    expect(displays[1]?.primary).toBe(true)
    expect(displays[1]?.friendlyName).toBe('24G2W1G4')
  })

  it('funciona com quebras de linha do Windows', () => {
    expect(parseDisplays(STARTUP_SOFTWARE_LOG.replace(/\n/g, '\r\n'))).toHaveLength(2)
  })

  it('usa a última listagem quando há várias', () => {
    const umSo = `[x]: Info: Currently available display devices:
[
  {
    "device_id": "{unico}",
    "display_name": "d",
    "friendly_name": "Unico",
    "info": { "primary": true, "origin_point": { "x": 0, "y": 0 }, "resolution": { "width": 800, "height": 600 } }
  }
]
`
    expect(parseDisplays(DISPLAYS_BLOCK + umSo).map((display) => display.deviceId)).toEqual(['{unico}'])
    expect(parseDisplays(umSo + DISPLAYS_BLOCK)).toHaveLength(2)
  })

  it('JSON quebrado, sem listagem ou vazio vira lista vazia', () => {
    expect(parseDisplays('')).toEqual([])
    expect(parseDisplays('Currently available display devices:\n[\n  {oops\n]')).toEqual([])
    expect(parseDisplays('Currently available display devices:\n[]')).toEqual([])
    expect(parseDisplays('Currently available display devices:\n{"a":1}')).toEqual([])
  })

  it('ignora itens sem identificador', () => {
    const log = 'Currently available display devices:\n[\n  {"friendly_name": "x"},\n  {"device_id": "{a}", "display_name": "d", "friendly_name": "f", "info": {}}\n]\n'
    expect(parseDisplays(log).map((display) => display.deviceId)).toEqual(['{a}'])
  })
})

describe('reinício', () => {
  it('detecta o fim da partida', () => {
    expect(isStartupComplete(STARTUP_SOFTWARE_LOG)).toBe(true)
    expect(isStartupComplete('só o começo')).toBe(false)
  })

  it('conta as partidas', () => {
    expect(countStartups(STARTUP_SOFTWARE_LOG)).toBe(1)
    expect(countStartups(STARTUP_SOFTWARE_LOG + STARTUP_AMF_LOG)).toBe(2)
    expect(countStartups('')).toBe(0)
  })

  it('a assinatura é a primeira linha e muda de uma execução para outra', () => {
    expect(logSignature(STARTUP_SOFTWARE_LOG)).toContain('Sunshine version')
    expect(logSignature(STARTUP_SOFTWARE_LOG)).not.toBe(logSignature(STARTUP_AMF_LOG))
    expect(logSignature('')).toBe('')
    expect(logSignature('a'.repeat(1000)).length).toBeLessThanOrEqual(160)
  })
})

describe('countSessionEvents', () => {
  it('conta conexões e desconexões', () => {
    const log = `${STARTUP_AMF_LOG}[2026-10-02 17:30:00.000]: Info: CLIENT DISCONNECTED
[2026-10-02 17:31:00.000]: Info: CLIENT CONNECTED
`
    expect(countSessionEvents(log)).toEqual({ connected: 2, disconnected: 1 })
  })

  it('texto parecido no meio de outra linha não conta', () => {
    expect(countSessionEvents('Info: o CLIENT CONNECTED falso aqui no meio\n')).toEqual({
      connected: 0,
      disconnected: 0
    })
  })

  it('funciona com quebras de linha do Windows', () => {
    expect(countSessionEvents(STARTUP_AMF_LOG.replace(/\n/g, '\r\n')).connected).toBe(1)
  })
})
```

Crie `app/src/main/engine/sunshine/log-file.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readLogTail } from './log-file'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-log-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readLogTail', () => {
  it('arquivo ausente devolve texto vazio', async () => {
    expect(await readLogTail(join(dir, 'nao-existe.log'))).toBe('')
  })

  it('arquivo pequeno vem inteiro', async () => {
    const file = join(dir, 'a.log')
    await writeFile(file, 'linha 1\nlinha 2\n', 'utf8')
    expect(await readLogTail(file)).toBe('linha 1\nlinha 2\n')
  })

  it('arquivo grande vem só pelo final', async () => {
    const file = join(dir, 'b.log')
    await writeFile(file, 'x'.repeat(5000) + 'FINAL', 'utf8')
    const tail = await readLogTail(file, 1000)
    expect(tail.length).toBeLessThanOrEqual(1000)
    expect(tail.endsWith('FINAL')).toBe(true)
  })

  it('um caractere cortado no começo da cauda não derruba a leitura', async () => {
    const file = join(dir, 'c.log')
    await writeFile(file, 'á'.repeat(2000), 'utf8')
    await expect(readLogTail(file, 1001)).resolves.toEqual(expect.any(String))
  })

  it('um caminho que é pasta devolve texto vazio', async () => {
    expect(await readLogTail(dir)).toBe('')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/log.test.ts src/main/engine/sunshine/log-file.test.ts
```

Expected: FAIL (módulos `./log` e `./log-file` não existem).

- [ ] **Step 4: Implementar**

Crie `app/src/main/engine/sunshine/log.ts`:

```ts
export interface SunshineDisplay {
  deviceId: string
  displayName: string
  friendlyName: string
  width: number
  height: number
  primary: boolean
  originX: number
}

export interface FoundEncoder {
  name: string
  backend: string
  hardware: boolean
}

const ENCODER_TEST_MARKER = 'Testing for available encoders'
const DISPLAY_MARKER = 'Currently available display devices:'
const STARTUP_MARKER = 'Configuration UI available at'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Resultado do último teste de encoders do log (um log pode ter várias execuções). */
export function parseFoundEncoder(log: string): FoundEncoder | null {
  const start = log.lastIndexOf(ENCODER_TEST_MARKER)
  if (start < 0) return null
  const match = /Found H\.264 encoder: (\S+) \[(\w+)\]/.exec(log.slice(start))
  if (!match) return null
  const [, name, backend] = match
  if (name === undefined || backend === undefined) return null
  return { name, backend, hardware: backend !== 'software' }
}

export function parseDisplays(log: string): SunshineDisplay[] {
  const marker = log.lastIndexOf(DISPLAY_MARKER)
  if (marker < 0) return []
  const rest = log.slice(marker + DISPLAY_MARKER.length)
  const open = rest.indexOf('\n[')
  if (open < 0) return []
  const close = rest.indexOf('\n]', open + 1)
  if (close < 0) return []

  let data: unknown
  try {
    data = JSON.parse(rest.slice(open + 1, close + 2))
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  return data.flatMap((item: unknown): SunshineDisplay[] => {
    if (!isRecord(item) || typeof item.device_id !== 'string') return []
    const info = isRecord(item.info) ? item.info : {}
    const resolution = isRecord(info.resolution) ? info.resolution : {}
    const origin = isRecord(info.origin_point) ? info.origin_point : {}
    return [
      {
        deviceId: item.device_id,
        displayName: typeof item.display_name === 'string' ? item.display_name : '',
        friendlyName: typeof item.friendly_name === 'string' ? item.friendly_name : '',
        width: typeof resolution.width === 'number' ? resolution.width : 0,
        height: typeof resolution.height === 'number' ? resolution.height : 0,
        primary: info.primary === true,
        originX: typeof origin.x === 'number' ? origin.x : 0
      }
    ]
  })
}

export const isStartupComplete = (log: string): boolean => log.includes(STARTUP_MARKER)

export const countStartups = (log: string): number => log.split(STARTUP_MARKER).length - 1

/** Primeira linha do log: muda a cada execução do Sunshine (traz a hora e a versão). */
export const logSignature = (log: string): string => (log.split(/\r?\n/, 1)[0] ?? '').slice(0, 160)

export function countSessionEvents(log: string): { connected: number; disconnected: number } {
  return {
    connected: (log.match(/: CLIENT CONNECTED[ \t]*\r?$/gm) ?? []).length,
    disconnected: (log.match(/: CLIENT DISCONNECTED[ \t]*\r?$/gm) ?? []).length
  }
}
```

Crie `app/src/main/engine/sunshine/log-file.ts`:

```ts
import { open } from 'node:fs/promises'

/** Lê no máximo `maxBytes` do final do arquivo. Arquivo ausente ou ilegível vira texto vazio. */
export async function readLogTail(path: string, maxBytes = 2_000_000): Promise<string> {
  let handle
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } catch {
    return ''
  } finally {
    await handle?.close()
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine/log.test.ts src/main/engine/sunshine/log-file.test.ts
npm run lint
npm run typecheck
```

Expected: PASS. Se o teste "usa a última listagem quando há várias" for frágil por causa da expressão que monta `umSo`, troque-o por uma amostra literal de uma listagem com um só monitor escrita à mão no próprio teste. Se `displayName` falhar por causa do nível de escape das barras no arquivo de amostras, ajuste **o arquivo de amostras** (não o parser) até que o log de amostra contenha exatamente `"display_name": "\\\\.\\DISPLAY40"` como o Sunshine escreve (quatro barras antes do ponto, em JSON válido).

- [ ] **Step 6: Provar com mutação**

1. Em `parseFoundEncoder`, troque `log.lastIndexOf(ENCODER_TEST_MARKER)` por `log.indexOf(ENCODER_TEST_MARKER)` e rode `npx vitest run src/main/engine/sunshine/log.test.ts`. Expected: FAIL em "usa só a última execução...". Desfaça.
2. Em `countSessionEvents`, troque a regex de `connected` para `/CLIENT CONNECTED/g` e rode de novo. Expected: FAIL em "texto parecido no meio de outra linha não conta". Desfaça e rode de novo: PASS.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add app/src/main/engine/sunshine
git commit -m "feat: leitura do log do Sunshine (encoder, monitores e sessao)"
```

---

### Task 7: Reinício com leitura do log e sonda de encoder

**Files:**
- Create: `app/src/main/engine/sunshine/restart.ts`, `app/src/main/engine/sunshine/encoder-probe.ts`, `app/src/main/engine/sunshine/memory.ts`, `app/src/main/engine/sunshine/testing/fake-process.ts`
- Test: `app/src/main/engine/sunshine/restart.test.ts`, `app/src/main/engine/sunshine/encoder-probe.test.ts`, `app/src/main/engine/sunshine/memory.test.ts`

**Interfaces:**
- Consumes: `SunshineApiPort` (Tarefa 4), funções do log (Tarefa 6), `GPU_ENCODERS`, `EncoderCandidate`, `Probe` de `core/encoder.ts`.
- Produces:
  - `createRestarter(deps: RestarterDeps): (alive?: () => boolean) => Promise<string>` (devolve o log novo; `''` se `alive()` ficou falso)
  - `interface RestarterDeps { api: Pick<SunshineApiPort, 'restart' | 'getConfig'>; readLog(): Promise<string>; sleep(ms: number): Promise<void>; timeoutMs?: number; pollMs?: number }`
  - `amdConfig(candidate: EncoderCandidate): Record<string, string>`
  - `createLogEncoderProbe(deps: { api: Pick<SunshineApiPort, 'saveConfig'>; restartAndRead: (alive?: () => boolean) => Promise<string> }): Probe`
  - `interface EngineMemory { load(): Promise<{ encoder: string | null } | null>; save(value: { encoder: string | null }): Promise<void> }` e `createEngineMemory(file: string): EngineMemory`
  - `FakeSunshineProcess` (em `testing/fake-process.ts`): implementa `SunshineApiPort` com `log: string`, `config`, `pairings`, `displays`, `hardwareWorksWith: Set<string>`, `reachable`, `restarts`, `calls`, `tick()`, `readLog()`

- [ ] **Step 1: Processo Sunshine simulado**

Crie `app/src/main/engine/sunshine/testing/fake-process.ts`. Ele imita o que importa do Sunshine real: o log só muda depois de um reinício, a API fica fora do ar por alguns "ticks" durante o reinício e o resultado do encoder depende da configuração gravada.

```ts
import { SunshineApiError, type Pairing, type SunshineApiPort } from '../api'

export interface FakeDisplay {
  deviceId: string
  friendlyName: string
  primary?: boolean
  originX?: number
}

const header = (n: number): string =>
  `[2026-10-02 18:00:0${n}.000]: Info: Sunshine version: 2026.914.233613 commit: abc\n`

/** Sunshine simulado: a API e o log reagem a reinícios, que duram `restartTicks` chamadas de tick(). */
export class FakeSunshineProcess implements SunshineApiPort {
  config: Record<string, unknown> = {}
  pairings: Pairing[] = []
  displays: FakeDisplay[] = [{ deviceId: '{aaa}', friendlyName: '24G2W1G4', primary: true }]
  /** Valores de amd_usage com os quais o encoder de GPU abre. */
  hardwareWorksWith = new Set<string>(['lowlatency_high_quality', 'transcoding'])
  acceptPin = '4821'
  reachable = true
  restartTicks = 2
  restarts = 0
  calls: string[] = []
  unauthorized = false
  log = ''

  private remaining = 0
  private nextLog: string | null = null

  constructor() {
    this.log = this.buildLog(0)
  }

  /** Chamado pelo `sleep` injetado nos testes: o tempo "passa" um passo. */
  tick(): void {
    if (this.remaining > 0) {
      this.remaining--
      if (this.remaining === 0 && this.nextLog !== null) {
        this.log = this.nextLog
        this.nextLog = null
        this.reachable = true
      }
    }
  }

  async readLog(): Promise<string> {
    return this.log
  }

  /** Refaz o log da partida atual a partir do estado de agora (monitores, configuração). */
  rebuildLog(): void {
    this.log = this.buildLog(0)
  }

  addLogLine(line: string): void {
    this.log += `[2026-10-02 18:30:00.000]: Info: ${line}\n`
  }

  private buildLog(n: number): string {
    const devices = this.displays.map((display) => ({
      device_id: display.deviceId,
      display_name: '\\\\.\\DISPLAY1',
      friendly_name: display.friendlyName,
      info: {
        primary: display.primary === true,
        origin_point: { x: display.originX ?? 0, y: 0 },
        resolution: { width: 1920, height: 1080 }
      }
    }))
    const usage = String(this.config.amd_usage ?? '')
    const software = String(this.config.encoder ?? '') === 'software'
    const hardware = !software && this.hardwareWorksWith.has(usage)
    const found = hardware ? 'h264_amf [amdvce]' : 'libx264 [software]'
    return (
      header(n) +
      `[2026-10-02 18:00:0${n}.100]: Info: Currently available display devices:\n` +
      JSON.stringify(devices, null, 2) +
      '\n' +
      `[2026-10-02 18:00:0${n}.200]: Info: // Testing for available encoders, this may generate errors. //\n` +
      `[2026-10-02 18:00:0${n}.300]: Info: Found H.264 encoder: ${found}\n` +
      `[2026-10-02 18:00:0${n}.400]: Info: Configuration UI available at [https://localhost:47990]\n`
    )
  }

  private guard(): void {
    if (!this.reachable) throw new SunshineApiError('unreachable', 'Não consegui falar com o Sunshine.')
    if (this.unauthorized) throw new SunshineApiError('unauthorized', 'O Sunshine recusou o usuário ou a senha.', 401)
  }

  async listPairings(): Promise<Pairing[]> {
    this.guard()
    return [...this.pairings]
  }

  async submitPin(request: { pairingId: string; pin: string; name: string }): Promise<boolean> {
    this.guard()
    this.calls.push(`submitPin:${request.pairingId}:${request.pin}:${request.name}`)
    const ok = this.pairings.some((p) => p.id === request.pairingId) && request.pin === this.acceptPin
    if (ok) this.pairings = this.pairings.filter((p) => p.id !== request.pairingId)
    return ok
  }

  async cancelPairing(pairingId: string): Promise<void> {
    this.guard()
    this.calls.push(`cancelPairing:${pairingId}`)
    this.pairings = this.pairings.filter((p) => p.id !== pairingId)
  }

  async getConfig(): Promise<Record<string, unknown>> {
    this.guard()
    return { ...this.config }
  }

  async saveConfig(patch: Record<string, string>): Promise<void> {
    this.guard()
    this.calls.push(`saveConfig:${JSON.stringify(patch)}`)
    this.config = { ...this.config, ...patch }
  }

  async restart(): Promise<void> {
    this.guard()
    this.calls.push('restart')
    this.restarts++
    this.reachable = false
    this.remaining = this.restartTicks
    this.nextLog = this.buildLog(this.restarts)
  }

  async closeApp(): Promise<void> {
    this.guard()
    this.calls.push('closeApp')
  }
}
```

- [ ] **Step 2: Testes (RED)**

Crie `app/src/main/engine/sunshine/restart.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRestarter } from './restart'
import { FakeSunshineProcess } from './testing/fake-process'
import { STARTUP_SOFTWARE_LOG } from './testing/log-samples'

function setup(process = new FakeSunshineProcess()) {
  const sleeps: number[] = []
  const sleep = async (ms: number): Promise<void> => {
    sleeps.push(ms)
    process.tick()
  }
  const restart = createRestarter({
    api: process,
    readLog: () => process.readLog(),
    sleep,
    timeoutMs: 10_000,
    pollMs: 500
  })
  return { process, sleeps, restart }
}

describe('createRestarter', () => {
  it('espera o Sunshine voltar e devolve o log novo, não o velho', async () => {
    const { process, restart } = setup()
    const before = process.log
    const log = await restart()
    expect(log).not.toBe(before)
    expect(log).toContain('Found H.264 encoder')
    expect(process.restarts).toBe(1)
    expect(process.reachable).toBe(true)
  })

  it('não confunde o log antigo com o novo enquanto o reinício não terminou', async () => {
    const process = new FakeSunshineProcess()
    process.restartTicks = 5
    const { restart, sleeps } = setup(process)
    await restart()
    expect(sleeps.length).toBeGreaterThanOrEqual(5)
  })

  it('desiste com uma mensagem clara se o Sunshine nunca volta', async () => {
    const process = new FakeSunshineProcess()
    process.restartTicks = 1_000_000
    const { restart } = setup(process)
    await expect(restart()).rejects.toThrow('O Sunshine não voltou depois de reiniciar.')
  })

  it('devolve texto vazio se a execução foi abandonada no meio', async () => {
    const { restart, process } = setup()
    let alive = true
    const result = restart(() => alive)
    alive = false
    expect(await result).toBe('')
    expect(process.restarts).toBe(1)
  })

  it('log que continua igual (sem nova partida) conta como reinício não concluído', async () => {
    const stuck = new FakeSunshineProcess()
    stuck.log = STARTUP_SOFTWARE_LOG
    stuck.restart = async () => undefined
    const restart = createRestarter({
      api: stuck,
      readLog: async () => STARTUP_SOFTWARE_LOG,
      sleep: async () => undefined,
      timeoutMs: 2000,
      pollMs: 500
    })
    await expect(restart()).rejects.toThrow('O Sunshine não voltou depois de reiniciar.')
  })
})
```

Crie `app/src/main/engine/sunshine/encoder-probe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { chooseEncoder, CPU_ENCODER, GPU_ENCODERS } from '../../core/encoder'
import { amdConfig, createLogEncoderProbe } from './encoder-probe'
import { createRestarter } from './restart'
import { FakeSunshineProcess } from './testing/fake-process'

function setup(works: string[]) {
  const process = new FakeSunshineProcess()
  process.hardwareWorksWith = new Set(works)
  const restartAndRead = createRestarter({
    api: process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    timeoutMs: 10_000,
    pollMs: 500
  })
  const probe = createLogEncoderProbe({ api: process, restartAndRead })
  return { process, probe }
}

describe('amdConfig', () => {
  it('traz o uso do candidato e as opções que provamos na RX 580', () => {
    expect(amdConfig(GPU_ENCODERS[1]!)).toEqual({
      amd_usage: 'transcoding',
      amd_rc: 'cbr',
      amd_quality: 'speed',
      amd_enforce_hrd: 'disabled',
      amd_preanalysis: 'disabled',
      amd_vbaq: 'disabled'
    })
  })

  it('o processador não leva opções da AMD', () => {
    expect(amdConfig(CPU_ENCODER)).toEqual({})
  })
})

describe('createLogEncoderProbe', () => {
  it('é verdadeiro quando o log mostra o encoder de GPU', async () => {
    const { probe, process } = setup(['lowlatency_high_quality'])
    expect(await probe(GPU_ENCODERS[0]!)).toBe(true)
    expect(process.config.amd_usage).toBe('lowlatency_high_quality')
    expect(process.restarts).toBe(1)
  })

  it('é falso quando o log mostra o encoder por software', async () => {
    const { probe } = setup([])
    expect(await probe(GPU_ENCODERS[0]!)).toBe(false)
  })

  it('o caso da RX 580: lowlatency falha e transcoding passa', async () => {
    const { probe } = setup(['transcoding'])
    const result = await chooseEncoder(probe)
    expect(result.candidate.id).toBe('gpu-transcoding')
    expect(result.fellBack).toBe(false)
  })

  it('nenhum candidato abre: termina no processador', async () => {
    const { probe } = setup([])
    const result = await chooseEncoder(probe)
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })

  it('um reinício que não termina vira falha do candidato, não exceção', async () => {
    const { probe, process } = setup(['lowlatency_high_quality'])
    process.restartTicks = 1_000_000
    const result = await chooseEncoder(probe, 'auto', 5000)
    expect(result.candidate).toEqual(CPU_ENCODER)
  })
})
```

Crie `app/src/main/engine/sunshine/memory.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEngineMemory } from './memory'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'horizonte-mem-'))
  file = join(dir, 'sub', 'engine.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createEngineMemory', () => {
  it('sem arquivo não há lembrança', async () => {
    expect(await createEngineMemory(file).load()).toBeNull()
  })

  it('grava e lê de volta, inclusive o "nenhum encoder de GPU funcionou"', async () => {
    const memory = createEngineMemory(file)
    await memory.save({ encoder: 'gpu-transcoding' })
    expect(await memory.load()).toEqual({ encoder: 'gpu-transcoding' })
    await memory.save({ encoder: null })
    expect(await memory.load()).toEqual({ encoder: null })
  })

  it.each(['{ não é json', '[]', '"texto"', '{"encoder": 5}', '{}'])('conteúdo inválido %s vira "sem lembrança"', async (content) => {
    const memory = createEngineMemory(file)
    await memory.save({ encoder: 'x' })
    await writeFile(file, content, 'utf8')
    expect(await memory.load()).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/restart.test.ts src/main/engine/sunshine/encoder-probe.test.ts src/main/engine/sunshine/memory.test.ts
```

Expected: FAIL (módulos não existem).

- [ ] **Step 4: Implementar**

Crie `app/src/main/engine/sunshine/restart.ts`:

```ts
import type { SunshineApiPort } from './api'
import { countStartups, isStartupComplete, logSignature } from './log'

export interface RestarterDeps {
  api: Pick<SunshineApiPort, 'restart' | 'getConfig'>
  readLog(): Promise<string>
  sleep(ms: number): Promise<void>
  timeoutMs?: number
  pollMs?: number
}

/**
 * Reinicia o Sunshine e só devolve o log quando ele é de uma partida NOVA e já terminou de subir.
 * Ler o log antigo como se fosse o novo é o erro clássico aqui, por isso comparamos a assinatura
 * (primeira linha) e o número de partidas de antes do reinício.
 */
export function createRestarter(deps: RestarterDeps): (alive?: () => boolean) => Promise<string> {
  const timeoutMs = deps.timeoutMs ?? 45_000
  const pollMs = deps.pollMs ?? 500

  return async (alive = () => true) => {
    const beforeLog = await deps.readLog()
    const before = { signature: logSignature(beforeLog), startups: countStartups(beforeLog) }

    await deps.api.restart()

    const polls = Math.max(1, Math.ceil(timeoutMs / pollMs))
    for (let i = 0; i < polls; i++) {
      await deps.sleep(pollMs)
      if (!alive()) return ''
      const log = await deps.readLog()
      const fresh = logSignature(log) !== before.signature || countStartups(log) > before.startups
      if (!fresh || !isStartupComplete(log)) continue
      try {
        await deps.api.getConfig()
      } catch {
        continue
      }
      return log
    }
    throw new Error('O Sunshine não voltou depois de reiniciar.')
  }
}
```

Crie `app/src/main/engine/sunshine/encoder-probe.ts`:

```ts
import type { EncoderCandidate, Probe } from '../../core/encoder'
import type { SunshineApiPort } from './api'
import { parseFoundEncoder } from './log'

/** Opções da AMD que provamos funcionar na RX 580 (as outras GPUs ignoram estas chaves). */
export function amdConfig(candidate: EncoderCandidate): Record<string, string> {
  if (candidate.kind !== 'gpu' || candidate.amdUsage === undefined) return {}
  return {
    amd_usage: candidate.amdUsage,
    amd_rc: 'cbr',
    amd_quality: 'speed',
    amd_enforce_hrd: 'disabled',
    amd_preanalysis: 'disabled',
    amd_vbaq: 'disabled'
  }
}

/**
 * Testa um candidato do jeito que o Sunshine testa: grava a configuração, reinicia e lê no log
 * se ele achou um encoder de hardware. O resultado é consultivo (o teste da partida já falhou
 * e depois passou com a mesma configuração), por isso quem usa isto nunca força o processador.
 */
export function createLogEncoderProbe(deps: {
  api: Pick<SunshineApiPort, 'saveConfig'>
  restartAndRead: (alive?: () => boolean) => Promise<string>
}): Probe {
  return async (candidate) => {
    await deps.api.saveConfig(amdConfig(candidate))
    const log = await deps.restartAndRead()
    return parseFoundEncoder(log)?.hardware === true
  }
}
```

Crie `app/src/main/engine/sunshine/memory.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface EngineMemoryValue {
  /** Id do candidato de GPU que funcionou, ou null se nenhum funcionou. */
  encoder: string | null
}

export interface EngineMemory {
  load(): Promise<EngineMemoryValue | null>
  save(value: EngineMemoryValue): Promise<void>
}

/** Lembra o resultado da sondagem para não reiniciar o Sunshine a cada abertura do app. */
export function createEngineMemory(file: string): EngineMemory {
  return {
    async load() {
      try {
        const data: unknown = JSON.parse(await readFile(file, 'utf8'))
        if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
        const encoder = (data as Record<string, unknown>).encoder
        if (encoder === null || typeof encoder === 'string') return { encoder }
        return null
      } catch {
        return null
      }
    },
    async save(value) {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, JSON.stringify(value), 'utf8')
      await rename(temporary, file)
    }
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine
npm run lint
npm run typecheck
```

Expected: PASS. Se o caso "log que continua igual..." do reiniciador ficar lento, reduza `timeoutMs`/`pollMs` no teste.

- [ ] **Step 6: Provar com mutação**

1. Em `restart.ts`, troque a condição `fresh` por `const fresh = true` e rode `npx vitest run src/main/engine/sunshine/restart.test.ts`. Expected: FAIL em "não confunde o log antigo com o novo..." e em "log que continua igual...". Desfaça.
2. Em `encoder-probe.ts`, troque `=== true` por `!== undefined` e rode `encoder-probe.test.ts`. Expected: FAIL em "é falso quando o log mostra o encoder por software". Desfaça e rode de novo: PASS.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add app/src/main/engine/sunshine
git commit -m "feat: reinicio com leitura do log, sonda de encoder e memoria do motor"
```

---

### Task 8: Vigia de sessão

Detecta cliente conectando e desconectando pelo log (o Sunshine não tem uma rota para isso).

**Files:**
- Create: `app/src/main/engine/sunshine/session-watcher.ts`
- Test: `app/src/main/engine/sunshine/session-watcher.test.ts`

**Interfaces:**
- Consumes: `countSessionEvents`, `logSignature` (Tarefa 6).
- Produces:
  - `interface SessionWatcherOptions { readLog(): Promise<string>; intervalMs?: number; deviceName(): string; onConnected(device: string): void; onDisconnected(): void; onError?(cause: unknown): void }`
  - `createSessionWatcher(options): { start(): void; stop(): void }`

- [ ] **Step 1: Testes (RED)**

Crie `app/src/main/engine/sunshine/session-watcher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionWatcher } from './session-watcher'

const run = (n: number, ...lines: string[]): string =>
  `[2026-10-02 18:00:0${n}.000]: Info: Sunshine version: x\n` +
  lines.map((line) => `[2026-10-02 18:00:0${n}.500]: Info: ${line}\n`).join('')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(initial: string) {
  let log = initial
  const events: string[] = []
  const errors: unknown[] = []
  const watcher = createSessionWatcher({
    readLog: async () => log,
    intervalMs: 100,
    deviceName: () => 'Notebook',
    onConnected: (device) => events.push(`connected:${device}`),
    onDisconnected: () => events.push('disconnected'),
    onError: (cause) => errors.push(cause)
  })
  return { watcher, events, errors, setLog: (next: string) => (log = next) }
}

describe('createSessionWatcher', () => {
  it('ignora o que já estava no log quando começou a vigiar', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED', 'CLIENT DISCONNECTED', 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(t.events).toEqual([])
    t.watcher.stop()
  })

  it('avisa quando um cliente conecta e desconecta', async () => {
    const t = setup(run(1))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(1, 'CLIENT CONNECTED', 'CLIENT DISCONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual(['connected:Notebook', 'disconnected'])
    t.watcher.stop()
  })

  it('não repete o aviso nas consultas seguintes', async () => {
    const t = setup(run(1))
    t.watcher.start()
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.events).toEqual(['connected:Notebook'])
    t.watcher.stop()
  })

  it('um log novo (Sunshine reiniciou) recomeça a contagem do zero', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(2, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(150)
    expect(t.events).toEqual(['connected:Notebook'])
    t.watcher.stop()
  })

  it('um log novo sem eventos não gera aviso nenhum', async () => {
    const t = setup(run(1, 'CLIENT CONNECTED'))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.setLog(run(2))
    await vi.advanceTimersByTimeAsync(350)
    expect(t.events).toEqual([])
    t.watcher.stop()
  })

  it('erro ao ler o log não para a vigilância', async () => {
    let fail = true
    const errors: unknown[] = []
    const events: string[] = []
    const watcher = createSessionWatcher({
      readLog: async () => {
        if (fail) throw new Error('arquivo travado')
        return run(1, 'CLIENT CONNECTED')
      },
      intervalMs: 100,
      deviceName: () => 'Notebook',
      onConnected: (device) => events.push(device),
      onDisconnected: () => undefined,
      onError: (cause) => errors.push(cause)
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(250)
    expect(errors.length).toBeGreaterThan(0)
    fail = false
    await vi.advanceTimersByTimeAsync(250)
    expect(events.length + errors.length).toBeGreaterThan(0)
    watcher.stop()
  })

  it('depois de parar, nada mais é avisado', async () => {
    const t = setup(run(1))
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(150)
    t.watcher.stop()
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.events).toEqual([])
  })

  it('começar duas vezes não duplica os avisos', async () => {
    const t = setup(run(1))
    t.watcher.start()
    t.watcher.start()
    t.setLog(run(1, 'CLIENT CONNECTED'))
    await vi.advanceTimersByTimeAsync(300)
    expect(t.events).toEqual(['connected:Notebook'])
    t.watcher.stop()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/session-watcher.test.ts
```

Expected: FAIL (`./session-watcher` não existe).

- [ ] **Step 3: Implementar**

Crie `app/src/main/engine/sunshine/session-watcher.ts`:

```ts
import { countSessionEvents, logSignature } from './log'

export interface SessionWatcherOptions {
  readLog(): Promise<string>
  intervalMs?: number
  /** Nome a mostrar para o cliente (o log do Sunshine não diz quem conectou). */
  deviceName(): string
  onConnected(device: string): void
  onDisconnected(): void
  onError?(cause: unknown): void
}

const MAX_EVENTS_PER_POLL = 5

/** Lê o log em intervalos e avisa só do que aconteceu DEPOIS que começou a vigiar. */
export function createSessionWatcher(options: SessionWatcherOptions): {
  start(): void
  stop(): void
} {
  const interval = options.intervalMs ?? 1000
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let run = 0

  const report = (cause: unknown): void => {
    try {
      options.onError?.(cause)
    } catch {
      // nada a fazer
    }
  }

  async function poll(token: number, baseline: { signature: string; connected: number; disconnected: number } | null): Promise<void> {
    let next = baseline
    try {
      const log = await options.readLog()
      if (token !== run) return
      const counts = countSessionEvents(log)
      const signature = logSignature(log)

      if (next === null) {
        next = { signature, ...counts }
      } else {
        const restarted = signature !== next.signature || counts.connected < next.connected || counts.disconnected < next.disconnected
        const base = restarted ? { connected: 0, disconnected: 0 } : next
        const connected = Math.min(counts.connected - base.connected, MAX_EVENTS_PER_POLL)
        const disconnected = Math.min(counts.disconnected - base.disconnected, MAX_EVENTS_PER_POLL)
        next = { signature, ...counts }
        for (let i = 0; i < connected; i++) {
          try {
            options.onConnected(options.deviceName())
          } catch (cause) {
            report(cause)
          }
        }
        for (let i = 0; i < disconnected; i++) {
          try {
            options.onDisconnected()
          } catch (cause) {
            report(cause)
          }
        }
      }
    } catch (cause) {
      if (token !== run) return
      report(cause)
    }
    if (token !== run) return
    timer = setTimeout(() => void poll(token, next), interval)
  }

  return {
    start() {
      if (active) return
      active = true
      void poll(++run, null)
    },
    stop() {
      active = false
      run++
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine/session-watcher.test.ts
npm run lint
npm run typecheck
```

Expected: PASS. O teste "avisa quando um cliente conecta e desconecta" depende de a primeira leitura (feita no `start`) ser a linha de base; confirme que o log inicial é lido antes de `setLog`.

- [ ] **Step 5: Provar com mutação**

Em `poll`, troque `const base = restarted ? { connected: 0, disconnected: 0 } : next` por `const base = next` e rode o teste. Expected: FAIL em "um log novo (Sunshine reiniciou) recomeça a contagem do zero". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/main/engine/sunshine/session-watcher.ts app/src/main/engine/sunshine/session-watcher.test.ts
git commit -m "feat: vigia de sessao que le conexoes e desconexoes no log"
```

---

### Task 9: SunshineEngine, preparar

**Files:**
- Create: `app/src/main/platform/types.ts`, `app/src/main/engine/sunshine/engine.ts`
- Test: `app/src/main/engine/sunshine/engine.prepare.test.ts`

**Interfaces:**
- Consumes: todo o das Tarefas 2 a 8.
- Produces:
  - `platform/types.ts`: `interface SunshineCredentials { username: string; password: string; port: number }`, `interface EngineInstaller { ensureInstalled(): Promise<void> }`, `interface VirtualDisplay { ensureVirtualDisplay(): Promise<void>; isVirtual(display: SunshineDisplay): boolean }`
  - `interface SunshineEngineDeps { installer: EngineInstaller; display: VirtualDisplay; memory: EngineMemory; credentials(): Promise<SunshineCredentials>; createApi(credentials: SunshineCredentials): SunshineApiPort; readLog(): Promise<string>; sleep(ms: number): Promise<void>; timing?: { reachableTimeoutMs?: number; pollMs?: number; restartTimeoutMs?: number; probeTimeoutMs?: number; pairingIntervalMs?: number; sessionIntervalMs?: number } }`
  - `class SunshineEngine implements ServerEngine` com `prepare(onStep, settings)` completo e os demais métodos (as Tarefas 10 completa pareamento, parar e abortar; aqui eles já existem como esqueleto que lança "ainda não implementado" para o `implements` compilar)

- [ ] **Step 1: Interfaces de plataforma**

Crie `app/src/main/platform/types.ts`:

```ts
import type { SunshineDisplay } from '../engine/sunshine/log'

export interface SunshineCredentials {
  username: string
  password: string
  /** Porta base do Sunshine (47989 por padrão). */
  port: number
}

/** Garante que o Sunshine está instalado e rodando. A implementação real (com administrador) é do Plano 2B. */
export interface EngineInstaller {
  ensureInstalled(): Promise<void>
}

/** Garante que existe um monitor virtual e sabe reconhecê-lo na lista do Sunshine. */
export interface VirtualDisplay {
  ensureVirtualDisplay(): Promise<void>
  isVirtual(display: SunshineDisplay): boolean
}
```

- [ ] **Step 2: Testes de preparar (RED)**

Crie `app/src/main/engine/sunshine/engine.prepare.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import type { EngineMemory, EngineMemoryValue } from './memory'
import type { PrepStep, Settings } from '../../../shared/types'
import { SunshineApiError } from './api'
import { SunshineEngine } from './engine'
import { FakeSunshineProcess } from './testing/fake-process'

const VIRTUAL = { deviceId: '{vdd}', friendlyName: 'VDD by MTT', originX: 1920 }
const PASSWORD = 'segredo-123'

function memory(initial: EngineMemoryValue | null = null): {
  api: EngineMemory
  box: { value: EngineMemoryValue | null }
} {
  const box: { value: EngineMemoryValue | null } = { value: initial }
  const api: EngineMemory = {
    load: async () => box.value,
    save: async (value) => {
      box.value = value
    }
  }
  return { api, box }
}

function setup(options: { withVirtual?: boolean; remembered?: EngineMemoryValue | null } = {}) {
  const process = new FakeSunshineProcess()
  if (options.withVirtual !== false) process.displays.push(VIRTUAL)
  process.rebuildLog()
  const mem = memory(options.remembered ?? null)
  const calls: string[] = []
  const engine = new SunshineEngine({
    installer: { ensureInstalled: async () => void calls.push('install') },
    display: {
      ensureVirtualDisplay: async () => void calls.push('display'),
      isVirtual: (display) => display.friendlyName === 'VDD by MTT'
    },
    memory: mem.api,
    credentials: async () => ({ username: 'horizonte', password: PASSWORD, port: 47989 }),
    createApi: () => process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    timing: { reachableTimeoutMs: 5000, restartTimeoutMs: 10_000, pollMs: 500 }
  })
  const steps: PrepStep[] = []
  const prepare = (settings: Settings = DEFAULT_SETTINGS): Promise<void> =>
    engine.prepare((step) => steps.push(step), settings)
  return { engine, process, mem, calls, steps, prepare }
}

describe('preparar: caminho feliz', () => {
  it('passa pelas três etapas na ordem e deixa tudo configurado', async () => {
    const t = setup()
    await t.prepare({ ...DEFAULT_SETTINGS, deviceName: 'Sala' })
    expect(t.steps).toEqual(['engine', 'display', 'encoder'])
    expect(t.calls).toEqual(['install', 'display'])
    expect(t.process.config.output_name).toBe('{vdd}')
    expect(t.process.config.sunshine_name).toBe('Sala')
    expect(t.process.config.amd_usage).toBe('lowlatency_high_quality')
    expect(t.process.config.encoder).toBe('')
    expect(t.mem.box.value).toEqual({ encoder: 'gpu-lowlatency_high_quality' })
  })

  it('o caso da RX 580: lowlatency falha, transcoding passa e fica gravado', async () => {
    const t = setup()
    t.process.hardwareWorksWith = new Set(['transcoding'])
    await t.prepare()
    expect(t.process.config.amd_usage).toBe('transcoding')
    expect(t.mem.box.value).toEqual({ encoder: 'gpu-transcoding' })
  })

  it('nenhum encoder de GPU confirmado: NÃO força o processador e lembra disso', async () => {
    const t = setup()
    t.process.hardwareWorksWith = new Set()
    await t.prepare()
    expect(t.process.config.encoder).toBe('')
    expect(t.process.config.amd_usage).toBe('lowlatency_high_quality')
    expect(t.mem.box.value).toEqual({ encoder: null })
  })

  it('o usuário escolheu o processador: força o software sem sondar', async () => {
    const t = setup()
    await t.prepare({ ...DEFAULT_SETTINGS, encoding: 'cpu' })
    expect(t.process.config.encoder).toBe('software')
    expect(t.process.calls.filter((call) => call.startsWith('saveConfig'))).toHaveLength(1)
  })
})

describe('preparar: de novo, sem reiniciar à toa', () => {
  it('na segunda vez, com tudo já configurado, não reinicia o Sunshine', async () => {
    const t = setup()
    await t.prepare()
    const restartsAfterFirst = t.process.restarts
    await t.prepare()
    expect(t.process.restarts).toBe(restartsAfterFirst)
  })

  it('com o resultado da sondagem lembrado, não sonda de novo', async () => {
    const t = setup({ remembered: { encoder: 'gpu-transcoding' } })
    await t.prepare()
    expect(t.process.config.amd_usage).toBe('transcoding')
    // Sem sondar e sem precisar procurar o monitor: só o reinício para aplicar a configuração.
    expect(t.process.restarts).toBe(1)
  })

  it('mudar o nome do computador regrava e reinicia uma vez', async () => {
    const t = setup()
    await t.prepare()
    const before = t.process.restarts
    await t.prepare({ ...DEFAULT_SETTINGS, deviceName: 'Outro nome' })
    expect(t.process.config.sunshine_name).toBe('Outro nome')
    expect(t.process.restarts).toBe(before + 1)
  })

  it('não apaga chaves que o usuário já tinha na configuração', async () => {
    const t = setup()
    t.process.config = { min_log_level: 'debug', global_prep_cmd: '[]' }
    await t.prepare()
    expect(t.process.config.min_log_level).toBe('debug')
    expect(t.process.config.global_prep_cmd).toBe('[]')
  })
})

describe('preparar: falhas', () => {
  it('sem o monitor virtual no Sunshine, diz isso em português', async () => {
    const t = setup({ withVirtual: false })
    await expect(t.prepare()).rejects.toThrow('Não achei o monitor virtual no Sunshine.')
  })

  it('senha recusada vira mensagem clara e não vaza a senha', async () => {
    const t = setup()
    t.process.unauthorized = true
    const failure = await t.prepare().then(
      () => null,
      (cause: unknown) => cause as Error
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure?.message).toContain('usuário ou a senha')
    expect(failure?.message).not.toContain(PASSWORD)
    expect(failure instanceof SunshineApiError || failure instanceof Error).toBe(true)
  })

  it('Sunshine que nunca responde vira mensagem clara', async () => {
    const t = setup()
    t.process.reachable = false
    await expect(t.prepare()).rejects.toThrow('O Sunshine não respondeu')
  })

  it('o instalador falhando para a preparação com a mensagem dele', async () => {
    const process = new FakeSunshineProcess()
    const engine = new SunshineEngine({
      installer: {
        ensureInstalled: async () => {
          throw new Error('Sem permissão para instalar.')
        }
      },
      display: { ensureVirtualDisplay: async () => undefined, isVirtual: () => true },
      memory: memory().api,
      credentials: async () => ({ username: 'u', password: 'p', port: 47989 }),
      createApi: () => process,
      readLog: () => process.readLog(),
      sleep: async () => process.tick()
    })
    await expect(engine.prepare(() => undefined, DEFAULT_SETTINGS)).rejects.toThrow('Sem permissão para instalar.')
  })
})

describe('preparar: abandonar no meio', () => {
  it('abort durante a preparação para as etapas seguintes', async () => {
    const t = setup()
    let count = 0
    const result = t.engine.prepare(() => {
      count++
      if (count === 2) void t.engine.abort()
    }, DEFAULT_SETTINGS)
    await result
    expect(t.process.config.amd_usage).toBeUndefined()
  })

  it('uma segunda preparação anula a primeira', async () => {
    const t = setup()
    const first = t.engine.prepare(() => undefined, DEFAULT_SETTINGS)
    const second = t.engine.prepare(() => undefined, { ...DEFAULT_SETTINGS, deviceName: 'Segunda' })
    await Promise.all([first, second])
    expect(t.process.config.sunshine_name).toBe('Segunda')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/engine.prepare.test.ts
```

Expected: FAIL (`./engine` não existe).

- [ ] **Step 4: Implementar o motor (preparar completo, resto como esqueleto)**

Crie `app/src/main/engine/sunshine/engine.ts`:

```ts
import type { PrepStep, Settings } from '../../../shared/types'
import { chooseEncoder, GPU_ENCODERS, type ChosenEncoder } from '../../core/encoder'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../../platform/types'
import type { ApproveRequest, PairRequest, ServerEngine } from '../port'
import { SunshineApiError, type SunshineApiPort } from './api'
import { amdConfig, createLogEncoderProbe } from './encoder-probe'
import { parseDisplays } from './log'
import type { EngineMemory } from './memory'
import { createRestarter } from './restart'

export interface SunshineEngineDeps {
  installer: EngineInstaller
  display: VirtualDisplay
  memory: EngineMemory
  credentials(): Promise<SunshineCredentials>
  createApi(credentials: SunshineCredentials): SunshineApiPort
  readLog(): Promise<string>
  sleep(ms: number): Promise<void>
  timing?: {
    reachableTimeoutMs?: number
    pollMs?: number
    restartTimeoutMs?: number
    probeTimeoutMs?: number
    pairingIntervalMs?: number
    sessionIntervalMs?: number
  }
}

type Listeners<A extends unknown[]> = Set<(...args: A) => void>

function friendly(cause: unknown): Error {
  if (cause instanceof SunshineApiError) {
    if (cause.kind === 'unauthorized') {
      return new Error('O Sunshine recusou o usuário ou a senha. Confira as credenciais.')
    }
    return new Error(cause.message)
  }
  return cause instanceof Error ? cause : new Error(String(cause))
}

/** Papel de servidor: prepara o Sunshine (monitor virtual e encoder), cuida do pareamento e da sessão. */
export class SunshineEngine implements ServerEngine {
  protected api: SunshineApiPort | null = null
  protected run = 0
  protected readonly pairListeners: Listeners<[PairRequest]> = new Set()
  protected readonly cancelListeners: Listeners<[string]> = new Set()
  protected readonly connectedListeners: Listeners<[string]> = new Set()
  protected readonly disconnectedListeners: Listeners<[]> = new Set()

  constructor(protected readonly deps: SunshineEngineDeps) {}

  private get timing(): Required<NonNullable<SunshineEngineDeps['timing']>> {
    const t = this.deps.timing ?? {}
    return {
      reachableTimeoutMs: t.reachableTimeoutMs ?? 30_000,
      pollMs: t.pollMs ?? 500,
      restartTimeoutMs: t.restartTimeoutMs ?? 45_000,
      probeTimeoutMs: t.probeTimeoutMs ?? 60_000,
      pairingIntervalMs: t.pairingIntervalMs ?? 2000,
      sessionIntervalMs: t.sessionIntervalMs ?? 1000
    }
  }

  async prepare(onStep: (step: PrepStep) => void, settings: Settings): Promise<void> {
    const run = ++this.run
    const alive = (): boolean => run === this.run
    this.stopWatchers()

    onStep('engine')
    await this.deps.installer.ensureInstalled()
    if (!alive()) return
    const api = this.deps.createApi(await this.deps.credentials())
    this.api = api
    await this.waitUntilReachable(api, alive)
    if (!alive()) return

    onStep('display')
    await this.deps.display.ensureVirtualDisplay()
    if (!alive()) return
    const restartAndRead = this.restarter(api)
    const displayId = await this.findVirtualDisplay(restartAndRead, alive)
    if (!alive()) return

    onStep('encoder')
    const chosen = await this.resolveEncoder(api, restartAndRead, settings, alive)
    if (!alive()) return

    const changed = await this.ensureConfig(api, this.desiredConfig(settings, displayId, chosen))
    if (changed) await restartAndRead(alive)
    if (!alive()) return

    this.startWatchers(api, settings)
  }

  private restarter(api: SunshineApiPort): (alive?: () => boolean) => Promise<string> {
    return createRestarter({
      api,
      readLog: this.deps.readLog,
      sleep: this.deps.sleep,
      timeoutMs: this.timing.restartTimeoutMs,
      pollMs: this.timing.pollMs
    })
  }

  private async waitUntilReachable(api: SunshineApiPort, alive: () => boolean): Promise<void> {
    const polls = Math.max(1, Math.ceil(this.timing.reachableTimeoutMs / this.timing.pollMs))
    for (let i = 0; i < polls; i++) {
      try {
        await api.getConfig()
        return
      } catch (cause) {
        if (cause instanceof SunshineApiError && cause.kind === 'unauthorized') throw friendly(cause)
        await this.deps.sleep(this.timing.pollMs)
        if (!alive()) return
      }
    }
    throw new Error('O Sunshine não respondeu. Confira se ele está instalado e aberto.')
  }

  private async findVirtualDisplay(
    restartAndRead: (alive?: () => boolean) => Promise<string>,
    alive: () => boolean
  ): Promise<string> {
    const find = (log: string): string | null =>
      parseDisplays(log).find((display) => this.deps.display.isVirtual(display))?.deviceId ?? null

    let id = find(await this.deps.readLog())
    if (id === null) {
      // O log atual pode ser de uma execução que não listou os monitores: reinicia para ver a lista.
      const log = await restartAndRead(alive)
      if (!alive()) return ''
      id = find(log)
    }
    if (id === null) throw new Error('Não achei o monitor virtual no Sunshine.')
    return id
  }

  private async resolveEncoder(
    api: SunshineApiPort,
    restartAndRead: (alive?: () => boolean) => Promise<string>,
    settings: Settings,
    alive: () => boolean
  ): Promise<ChosenEncoder | null> {
    if (settings.encoding === 'cpu') return null
    const remembered = await this.deps.memory.load()
    if (remembered !== null) {
      const candidate = GPU_ENCODERS.find((item) => item.id === remembered.encoder)
      return candidate ? { candidate, fellBack: false } : null
    }
    const probe = createLogEncoderProbe({ api, restartAndRead: (a) => restartAndRead(a ?? alive) })
    const chosen = await chooseEncoder(probe, settings.encoding, this.timing.probeTimeoutMs)
    if (!alive()) return null
    // Só lembramos de verdade o que foi confirmado; "nenhum" também é lembrado para não reiniciar à toa.
    await this.deps.memory.save({ encoder: chosen.fellBack ? null : chosen.candidate.id })
    return chosen.fellBack ? null : chosen
  }

  private desiredConfig(
    settings: Settings,
    displayId: string,
    chosen: ChosenEncoder | null
  ): Record<string, string> {
    const base = { sunshine_name: settings.deviceName, output_name: displayId }
    if (settings.encoding === 'cpu') return { ...base, encoder: 'software' }
    // Sem confirmação de GPU deixamos o Sunshine decidir sozinho (ele cai para software se precisar).
    const candidate = chosen?.candidate ?? GPU_ENCODERS[0]!
    return { ...base, encoder: '', ...amdConfig(candidate) }
  }

  /** Grava só o que mudou. Devolve verdadeiro se mudou algo (e portanto precisa reiniciar). */
  private async ensureConfig(api: SunshineApiPort, desired: Record<string, string>): Promise<boolean> {
    const current = await api.getConfig()
    const diff = Object.fromEntries(
      Object.entries(desired).filter(([key, value]) => String(current[key] ?? '') !== value)
    )
    if (Object.keys(diff).length === 0) return false
    await api.saveConfig(diff)
    return true
  }

  // As partes abaixo são da Tarefa 10.
  protected startWatchers(_api: SunshineApiPort, _settings: Settings): void {
    // implementado na Tarefa 10
  }

  protected stopWatchers(): void {
    // implementado na Tarefa 10
  }

  async abort(): Promise<void> {
    this.run++
    this.stopWatchers()
  }

  async approve(_request: ApproveRequest): Promise<void> {
    throw new Error('Ainda não implementado.')
  }

  async deny(_pairingId: string): Promise<void> {
    throw new Error('Ainda não implementado.')
  }

  async stopSending(): Promise<void> {
    throw new Error('Ainda não implementado.')
  }

  async applyBitrate(_mbps: number): Promise<void> {
    // implementado na Tarefa 10
  }

  onPairRequest(callback: (request: PairRequest) => void): () => void {
    this.pairListeners.add(callback)
    return () => void this.pairListeners.delete(callback)
  }

  onPairCancelled(callback: (pairingId: string) => void): () => void {
    this.cancelListeners.add(callback)
    return () => void this.cancelListeners.delete(callback)
  }

  onClientConnected(callback: (device: string) => void): () => void {
    this.connectedListeners.add(callback)
    return () => void this.connectedListeners.delete(callback)
  }

  onClientDisconnected(callback: () => void): () => void {
    this.disconnectedListeners.add(callback)
    return () => void this.disconnectedListeners.delete(callback)
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine/engine.prepare.test.ts
npm run lint
npm run typecheck
```

Expected: PASS. Pontos que costumam exigir ajuste fino:

- "uma segunda preparação anula a primeira": a primeira chamada de `prepare` avança até o primeiro `await`; confirme que ela devolve cedo (via `alive()`) sem gravar `sunshine_name`.
- "abort durante a preparação": o `abort()` chamado dentro de `onStep` incrementa `run`; a etapa seguinte deve devolver sem gravar `amd_usage`.
- Se o teste de senha recusada não conseguir ler a mensagem, verifique que `waitUntilReachable` relança `friendly(cause)` para `unauthorized` (o `FakeSunshineProcess.unauthorized` lança `SunshineApiError('unauthorized', ...)`).
- Mensagem de timeout do teste "nunca responde": `waitUntilReachable` lança `'O Sunshine não respondeu. Confira se ele está instalado e aberto.'`; o `toThrow` casa por trecho.

- [ ] **Step 6: Provar com mutação**

1. Em `desiredConfig`, troque `encoder: ''` por `encoder: 'software'` (forçar o processador) e rode `npx vitest run src/main/engine/sunshine/engine.prepare.test.ts`. Expected: FAIL em "nenhum encoder de GPU confirmado: NÃO força o processador" e em "o caso da RX 580". Desfaça.
2. Em `ensureConfig`, troque o filtro por `Object.entries(desired)` (grava sempre tudo) e rode de novo. Expected: FAIL em "na segunda vez, com tudo já configurado, não reinicia o Sunshine". Desfaça e rode de novo: PASS.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add app/src/main/platform app/src/main/engine/sunshine
git commit -m "feat: SunshineEngine prepara monitor virtual e encoder sem reiniciar a toa"
```

---

### Task 10: SunshineEngine, pareamento, sessão, parar e abortar

**Files:**
- Modify: `app/src/main/engine/sunshine/engine.ts`
- Test: `app/src/main/engine/sunshine/engine.runtime.test.ts`

**Interfaces:**
- Consumes: `createPairingWatcher` (Tarefa 5), `createSessionWatcher` (Tarefa 8), `ApproveRequest`, `PairRequest`.
- Produces: o `SunshineEngine` completo (`approve`, `deny`, `stopSending`, `abort`, `applyBitrate`, e os eventos funcionando depois de `prepare`).

- [ ] **Step 1: Testes (RED)**

Crie `app/src/main/engine/sunshine/engine.runtime.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import type { EngineMemory } from './memory'
import { SunshineEngine } from './engine'
import { FakeSunshineProcess } from './testing/fake-process'
import type { PairRequest } from '../port'

const PASSWORD = 'segredo-123'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function ready() {
  const process = new FakeSunshineProcess()
  process.displays.push({ deviceId: '{vdd}', friendlyName: 'VDD by MTT', originX: 1920 })
  process.rebuildLog()
  const memory: EngineMemory = {
    load: async () => ({ encoder: 'gpu-lowlatency_high_quality' }),
    save: async () => undefined
  }
  const engine = new SunshineEngine({
    installer: { ensureInstalled: async () => undefined },
    display: { ensureVirtualDisplay: async () => undefined, isVirtual: (d) => d.friendlyName === 'VDD by MTT' },
    memory,
    credentials: async () => ({ username: 'u', password: PASSWORD, port: 47989 }),
    createApi: () => process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    timing: { pairingIntervalMs: 100, sessionIntervalMs: 100, pollMs: 100 }
  })
  const requests: PairRequest[] = []
  const cancelled: string[] = []
  const connected: string[] = []
  let disconnected = 0
  engine.onPairRequest((r) => requests.push(r))
  engine.onPairCancelled((id) => cancelled.push(id))
  engine.onClientConnected((d) => connected.push(d))
  engine.onClientDisconnected(() => disconnected++)
  const prepared = engine.prepare(() => undefined, DEFAULT_SETTINGS)
  await vi.advanceTimersByTimeAsync(0)
  await prepared
  return { engine, process, requests, cancelled, connected, disconnected: () => disconnected }
}

describe('pareamento', () => {
  it('um pedido novo no Sunshine vira um pedido para a interface', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests).toEqual([{ device: 'Notebook', pairingId: 'p1' }])
  })

  it('dispositivo sem nome ganha um nome genérico', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p2', name: '', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests[0]?.device).toBe('Outro computador')
  })

  it('nome hostil é limpo antes de chegar à interface', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p3', name: `A\nB${String.fromCharCode(0x202e)}C`, address: 'x' })
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests[0]?.device).toBe('ABC')
  })

  it('aprovar com o PIN certo manda o PIN ao Sunshine', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await t.engine.approve({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    expect(t.process.calls).toContain('submitPin:p1:4821:Notebook')
  })

  it('PIN errado vira uma mensagem clara', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await expect(t.engine.approve({ pairingId: 'p1', pin: '0000', name: 'Notebook' })).rejects.toThrow('O PIN não confere')
  })

  it('PIN fora do formato nem chega ao Sunshine', async () => {
    const t = await ready()
    await expect(t.engine.approve({ pairingId: 'p1', pin: '12', name: 'x' })).rejects.toThrow('PIN')
    expect(t.process.calls.some((call) => call.startsWith('submitPin'))).toBe(false)
  })

  it('recusar cancela o pedido no Sunshine', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await t.engine.deny('p1')
    expect(t.process.calls).toContain('cancelPairing:p1')
  })

  it('o pedido que some do Sunshine avisa o cancelamento', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    t.process.pairings = []
    await vi.advanceTimersByTimeAsync(250)
    expect(t.cancelled).toEqual(['p1'])
  })

  it('a API caindo no meio não derruba a vigilância', async () => {
    const t = await ready()
    t.process.reachable = false
    await vi.advanceTimersByTimeAsync(500)
    t.process.reachable = true
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(1500)
    expect(t.requests).toHaveLength(1)
  })

  it('sem ter preparado, aprovar diz que o Sunshine não está pronto', async () => {
    const engine = new SunshineEngine({
      installer: { ensureInstalled: async () => undefined },
      display: { ensureVirtualDisplay: async () => undefined, isVirtual: () => true },
      memory: { load: async () => null, save: async () => undefined },
      credentials: async () => ({ username: 'u', password: 'p', port: 1 }),
      createApi: () => new FakeSunshineProcess(),
      readLog: async () => '',
      sleep: async () => undefined
    })
    await expect(engine.approve({ pairingId: 'p', pin: '4821', name: 'x' })).rejects.toThrow('não está pronto')
  })
})

describe('sessão', () => {
  it('cliente que conecta e desconecta vira aviso com o nome do último aprovado', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await t.engine.approve({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    t.process.addLogLine('CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(250)
    expect(t.connected).toEqual(['Notebook'])
    t.process.addLogLine('CLIENT DISCONNECTED')
    await vi.advanceTimersByTimeAsync(250)
    expect(t.disconnected()).toBe(1)
  })

  it('sem ninguém aprovado, usa um nome genérico', async () => {
    const t = await ready()
    t.process.addLogLine('CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(250)
    expect(t.connected).toEqual(['Outro computador'])
  })
})

describe('parar e abortar', () => {
  it('parar de enviar fecha o aplicativo em execução', async () => {
    const t = await ready()
    await t.engine.stopSending()
    expect(t.process.calls).toContain('closeApp')
  })

  it('abort para as vigilâncias', async () => {
    const t = await ready()
    await t.engine.abort()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    t.process.addLogLine('CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.requests).toEqual([])
    expect(t.connected).toEqual([])
  })

  it('preparar de novo não duplica as vigilâncias', async () => {
    const t = await ready()
    const again = t.engine.prepare(() => undefined, DEFAULT_SETTINGS)
    await vi.advanceTimersByTimeAsync(0)
    await again
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(300)
    expect(t.requests).toHaveLength(1)
  })

  it('o ajuste de bitrate só vale na próxima conexão e guarda o limite em kbps', async () => {
    const t = await ready()
    await t.engine.applyBitrate(40)
    expect(t.process.config.max_bitrate).toBe('40000')
  })

  it('ajustar o bitrate sem ter preparado não faz nada', async () => {
    const engine = new SunshineEngine({
      installer: { ensureInstalled: async () => undefined },
      display: { ensureVirtualDisplay: async () => undefined, isVirtual: () => true },
      memory: { load: async () => null, save: async () => undefined },
      credentials: async () => ({ username: 'u', password: 'p', port: 1 }),
      createApi: () => new FakeSunshineProcess(),
      readLog: async () => '',
      sleep: async () => undefined
    })
    await expect(engine.applyBitrate(40)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/engine/sunshine/engine.runtime.test.ts
```

Expected: FAIL (aprovar/recusar/parar ainda lançam "Ainda não implementado" e os vigias não existem).

- [ ] **Step 3: Completar o motor**

Em `app/src/main/engine/sunshine/engine.ts`: importe `createPairingWatcher`, `createSessionWatcher`, `isValidPin` (de `'../../../shared/pin'`) e `cleanName` (de `'../../../shared/names'`), acrescente os campos privados, e **substitua** o bloco "As partes abaixo são da Tarefa 10" e os métodos `approve`, `deny`, `stopSending`, `applyBitrate`:

```ts
// no topo, junto dos imports
import { cleanName } from '../../../shared/names'
import { isValidPin } from '../../../shared/pin'
import { createPairingWatcher, type PairingWatcher } from './pairing-watcher'
import { createSessionWatcher } from './session-watcher'
```

```ts
  // campos novos na classe
  private pairing: PairingWatcher | null = null
  private session: { start(): void; stop(): void } | null = null
  private lastApprovedName = 'Outro computador'

  protected startWatchers(api: SunshineApiPort, _settings: Settings): void {
    this.stopWatchers()
    this.pairing = createPairingWatcher({
      api,
      intervalMs: this.timing.pairingIntervalMs,
      onRequest: (pairing) => {
        const device = cleanName(pairing.name) || 'Outro computador'
        for (const listener of [...this.pairListeners]) listener({ device, pairingId: pairing.id })
      },
      onCancelled: (pairingId) => {
        for (const listener of [...this.cancelListeners]) listener(pairingId)
      }
    })
    this.session = createSessionWatcher({
      readLog: this.deps.readLog,
      intervalMs: this.timing.sessionIntervalMs,
      deviceName: () => this.lastApprovedName,
      onConnected: (device) => {
        for (const listener of [...this.connectedListeners]) listener(device)
      },
      onDisconnected: () => {
        for (const listener of [...this.disconnectedListeners]) listener()
      }
    })
    this.pairing.start()
    this.session.start()
  }

  protected stopWatchers(): void {
    this.pairing?.stop()
    this.session?.stop()
    this.pairing = null
    this.session = null
  }

  private requireApi(): SunshineApiPort {
    if (this.api === null) throw new Error('O Sunshine não está pronto ainda.')
    return this.api
  }

  async approve(request: ApproveRequest): Promise<void> {
    const api = this.requireApi()
    if (!isValidPin(request.pin)) throw new Error('O PIN precisa ter 4 números.')
    let accepted: boolean
    try {
      accepted = await api.submitPin({
        pairingId: request.pairingId,
        pin: request.pin,
        name: cleanName(request.name) || 'Outro computador'
      })
    } catch (cause) {
      throw friendly(cause)
    }
    if (!accepted) throw new Error('O PIN não confere. Confira o número que aparece no outro computador.')
    this.lastApprovedName = cleanName(request.name) || 'Outro computador'
  }

  async deny(pairingId: string): Promise<void> {
    try {
      await this.requireApi().cancelPairing(pairingId)
    } catch (cause) {
      throw friendly(cause)
    }
  }

  async stopSending(): Promise<void> {
    try {
      await this.requireApi().closeApp()
    } catch (cause) {
      throw friendly(cause)
    }
  }

  /** O Sunshine só lê o limite ao iniciar uma sessão; vale na próxima conexão. */
  async applyBitrate(mbps: number): Promise<void> {
    if (this.api === null) return
    try {
      await this.api.saveConfig({ max_bitrate: String(Math.round(mbps * 1000)) })
    } catch (cause) {
      throw friendly(cause)
    }
  }
```

Apague os esqueletos antigos de `startWatchers`, `stopWatchers`, `approve`, `deny`, `stopSending` e `applyBitrate` e o comentário "As partes abaixo são da Tarefa 10". Mantenha `abort()`.

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/main/engine/sunshine
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: PASS em todos, incluindo a suíte inteira.

- [ ] **Step 5: Provar com mutação**

1. Em `approve`, troque `if (!isValidPin(request.pin)) throw ...` por nada (remova a linha) e rode `engine.runtime.test.ts`. Expected: FAIL em "PIN fora do formato nem chega ao Sunshine". Desfaça.
2. Em `abort()`, apague a chamada `this.stopWatchers()` e rode de novo. Expected: FAIL em "abort para as vigilâncias". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/main/engine/sunshine
git commit -m "feat: SunshineEngine com pareamento por PIN, vigia de sessao e abort"
```

---

### Task 11: Adaptadores de "instalação existente" e fiação no processo principal

Enquanto o Plano 2B não traz a instalação de verdade, um modo de desenvolvimento usa o Sunshine que já está instalado e as credenciais que você mesmo fornece por variáveis de ambiente. O padrão continua sendo o motor de mentira.

**Files:**
- Create: `app/src/main/platform/existing.ts`
- Test: `app/src/main/platform/existing.test.ts`
- Modify: `app/src/main/index.ts`, `app/src/main/dev-demo.ts`

**Interfaces:**
- Produces:
  - `existingInstaller(): EngineInstaller` (não instala nada; só confirma depois, quando a API responder)
  - `existingDisplay(): VirtualDisplay` (`isVirtual` reconhece `VDD`, `Virtual` e `Parsec Virtual` no nome amigável, sem diferenciar maiúsculas)
  - `readDevEngineConfig(env: NodeJS.ProcessEnv): DevEngineConfig | null` (`null` quando `HORIZONTE_ENGINE` não é `sunshine`; lança com mensagem clara se faltar usuário ou senha)

- [ ] **Step 1: Testes (RED)**

Crie `app/src/main/platform/existing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { existingDisplay, existingInstaller, readDevEngineConfig } from './existing'

const display = (friendlyName: string) => ({
  deviceId: '{x}',
  displayName: 'd',
  friendlyName,
  width: 1920,
  height: 1080,
  primary: false,
  originX: 0
})

describe('existingDisplay', () => {
  it.each(['VDD by MTT', 'Virtual Display Driver', 'Parsec Virtual Display', 'vdd'])(
    'reconhece %s como virtual',
    (name) => {
      expect(existingDisplay().isVirtual(display(name))).toBe(true)
    }
  )

  it.each(['24G2W1G4', 'DELL U2720Q', ''])('não confunde %s com virtual', (name) => {
    expect(existingDisplay().isVirtual(display(name))).toBe(false)
  })

  it('não cria nada: só garante sem erro', async () => {
    await expect(existingDisplay().ensureVirtualDisplay()).resolves.toBeUndefined()
    await expect(existingInstaller().ensureInstalled()).resolves.toBeUndefined()
  })
})

describe('readDevEngineConfig', () => {
  it('sem a variável do motor, usa o motor de mentira', () => {
    expect(readDevEngineConfig({})).toBeNull()
    expect(readDevEngineConfig({ HORIZONTE_ENGINE: 'fake' })).toBeNull()
  })

  it('lê usuário, senha, porta e caminho do log', () => {
    const config = readDevEngineConfig({
      HORIZONTE_ENGINE: 'sunshine',
      HORIZONTE_SUNSHINE_USER: 'matheus',
      HORIZONTE_SUNSHINE_PASSWORD: 'segredo',
      HORIZONTE_SUNSHINE_PORT: '48989',
      HORIZONTE_SUNSHINE_LOG: 'D:\\logs\\sunshine.log'
    })
    expect(config).toEqual({
      credentials: { username: 'matheus', password: 'segredo', port: 48989 },
      logPath: 'D:\\logs\\sunshine.log'
    })
  })

  it('usa a porta e o log padrão do Windows', () => {
    const config = readDevEngineConfig({
      HORIZONTE_ENGINE: 'sunshine',
      HORIZONTE_SUNSHINE_USER: 'u',
      HORIZONTE_SUNSHINE_PASSWORD: 'p'
    })
    expect(config?.credentials.port).toBe(47989)
    expect(config?.logPath).toBe('C:\\Program Files\\Sunshine\\config\\sunshine.log')
  })

  it.each([
    [{ HORIZONTE_SUNSHINE_PASSWORD: 'p' }],
    [{ HORIZONTE_SUNSHINE_USER: 'u' }],
    [{ HORIZONTE_SUNSHINE_USER: '', HORIZONTE_SUNSHINE_PASSWORD: 'p' }]
  ])('sem usuário ou senha explica o que falta, sem imprimir a senha', (extra) => {
    const run = (): unknown => readDevEngineConfig({ HORIZONTE_ENGINE: 'sunshine', ...extra })
    expect(run).toThrow('HORIZONTE_SUNSHINE_USER')
    try {
      run()
    } catch (cause) {
      expect(String((cause as Error).message)).not.toContain('"p"')
    }
  })

  it.each(['abc', '0', '-1', '70000', '47989.5'])('porta inválida %s é recusada', (port) => {
    expect(() =>
      readDevEngineConfig({
        HORIZONTE_ENGINE: 'sunshine',
        HORIZONTE_SUNSHINE_USER: 'u',
        HORIZONTE_SUNSHINE_PASSWORD: 'p',
        HORIZONTE_SUNSHINE_PORT: port
      })
    ).toThrow('HORIZONTE_SUNSHINE_PORT')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/platform/existing.test.ts
```

Expected: FAIL (`./existing` não existe).

- [ ] **Step 3: Implementar os adaptadores**

Crie `app/src/main/platform/existing.ts`:

```ts
import type { SunshineDisplay } from '../engine/sunshine/log'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from './types'

const DEFAULT_PORT = 47989
const DEFAULT_LOG = 'C:\\Program Files\\Sunshine\\config\\sunshine.log'

/** Modo de desenvolvimento: o Sunshine já está instalado e rodando; a API dirá se não estiver. */
export function existingInstaller(): EngineInstaller {
  return { ensureInstalled: async () => undefined }
}

/** Modo de desenvolvimento: o monitor virtual já existe; só sabemos reconhecê-lo pelo nome. */
export function existingDisplay(): VirtualDisplay {
  return {
    ensureVirtualDisplay: async () => undefined,
    isVirtual: (display: SunshineDisplay) => /vdd|virtual/i.test(display.friendlyName)
  }
}

export interface DevEngineConfig {
  credentials: SunshineCredentials
  logPath: string
}

/** Lê as variáveis de ambiente do modo de desenvolvimento. Devolve null se não for o motor "sunshine". */
export function readDevEngineConfig(env: NodeJS.ProcessEnv): DevEngineConfig | null {
  if (env['HORIZONTE_ENGINE'] !== 'sunshine') return null

  const username = env['HORIZONTE_SUNSHINE_USER']
  const password = env['HORIZONTE_SUNSHINE_PASSWORD']
  if (!username || !password) {
    throw new Error(
      'Defina HORIZONTE_SUNSHINE_USER e HORIZONTE_SUNSHINE_PASSWORD para usar o Sunshine de verdade.'
    )
  }

  const rawPort = env['HORIZONTE_SUNSHINE_PORT']
  const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_000) {
    throw new Error('HORIZONTE_SUNSHINE_PORT precisa ser um número de porta válido.')
  }

  return {
    credentials: { username, password, port },
    logPath: env['HORIZONTE_SUNSHINE_LOG'] || DEFAULT_LOG
  }
}
```

- [ ] **Step 4: Fiação no processo principal**

Em `app/src/main/index.ts`, acrescente os imports

```ts
import { composeEngine } from './engine/compose'
import { readLogTail } from './engine/sunshine/log-file'
import { SunshineApi } from './engine/sunshine/api'
import { SunshineEngine } from './engine/sunshine/engine'
import { createEngineMemory } from './engine/sunshine/memory'
import { existingDisplay, existingInstaller, readDevEngineConfig } from './platform/existing'
```

e troque, em `boot()`, as linhas que criam o motor e o controlador por:

```ts
  const fake = new FakeEngine(is.dev ? 700 : 0)
  const dev = readDevEngineConfig(process.env)
  const engine = dev
    ? composeEngine(
        new SunshineEngine({
          installer: existingInstaller(),
          display: existingDisplay(),
          memory: createEngineMemory(join(app.getPath('userData'), 'engine.json')),
          credentials: async () => dev.credentials,
          createApi: (credentials) =>
            new SunshineApi({
              port: credentials.port,
              username: credentials.username,
              password: credentials.password
            }),
          readLog: () => readLogTail(dev.logPath),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        }),
        fake
      )
    : fake
  const controller = await createController({ engine, store })
  if (!dev && !app.isPackaged) runDevDemo(controller, fake)
```

(O roteiro de demonstração só roda com o motor de mentira; com o Sunshine real o pareamento vem do Sunshine de verdade.) `dev-demo.ts` já recebe `FakeEngine`; nada a mudar além do que a Tarefa 1 fez.

- [ ] **Step 5: Rodar tudo e ver passar**

```powershell
npx vitest run src/main/platform/existing.test.ts
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: tudo verde.

- [ ] **Step 6: Provar com mutação**

Em `readDevEngineConfig`, troque `port > 65_000` por `port > 99_000` e rode `existing.test.ts`. Expected: FAIL em "porta inválida 70000 é recusada". Desfaça e rode de novo: PASS.

- [ ] **Step 7: Verificar que o padrão continua sendo o motor de mentira**

```powershell
npm run build
```

Rode `npm run dev` **sem** nenhuma variável `HORIZONTE_*`: o app abre e o roteiro de demonstração se comporta como no Plano 1 (instalar, enviar, preparar, pedido de pareamento, conectado). Feche o app.

- [ ] **Step 8: Commit**

```powershell
cd ..
git add app/src/main
git commit -m "feat: modo de desenvolvimento com o Sunshine real via variaveis de ambiente"
```

---

### Task 12: Verificação de ponta a ponta com o Sunshine real (com você)

Esta tarefa não tem código novo. Ela prova, na instância real do Sunshine desta máquina, as suposições que os testes só podem simular. **Exige você** (senha do painel do Sunshine e o Moonlight no notebook). Quem executa o plano prepara tudo e pede a participação nos pontos marcados.

**Files:**
- Nenhum arquivo de código. Resultados vão para o commit final da tarefa, em `docs/superpowers/plans/2026-10-02-horizonte-plano-2a-resultados.md`.

- [ ] **Step 1: Preparar o ambiente sem expor a senha**

Peça que você abra um PowerShell **seu** (a senha não passa pelo chat) e rode, na pasta `app`:

```powershell
$env:HORIZONTE_ENGINE = 'sunshine'
$env:HORIZONTE_SUNSHINE_USER = 'SEU_USUARIO_DO_PAINEL'
$env:HORIZONTE_SUNSHINE_PASSWORD = Read-Host 'Senha do painel do Sunshine'
npm run dev
```

Expected: o app abre normalmente. Se faltar usuário ou senha, o app avisa o que falta (sem imprimir a senha).

- [ ] **Step 2: Conferir as suposições da API (somente leitura)**

Com o app aberto e o Sunshine rodando, num segundo PowerShell (com as mesmas variáveis), rode:

```powershell
$cred = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$env:HORIZONTE_SUNSHINE_USER`:$env:HORIZONTE_SUNSHINE_PASSWORD"))
curl.exe -sk -H "Authorization: Basic $cred" https://localhost:47990/api/pin
curl.exe -sk -H "Authorization: Basic $cred" https://localhost:47990/api/config
```

Anote no arquivo de resultados: (a) o formato real de `GET /api/pin`; (b) se `GET /api/config` devolve **todas** as chaves (inclusive as padrão) e se os valores são texto, número, booleano ou lista. Se a resposta de `/api/config` não for um objeto simples de chave e valor, corrija `getConfig` e `saveConfig` (com teste que falha antes) antes de seguir.

- [ ] **Step 3: Fazer a preparação de verdade e conferir a configuração**

No app, clique **Instalar** e **Enviar a tela**. Observe as etapas. Depois confira a configuração do Sunshine **não perdeu nada**:

```powershell
Get-Content 'C:\Program Files\Sunshine\config\sunshine.conf'
```

Expected: continuam presentes `output_name = {5eb52002-...}` (o monitor virtual), as chaves `amd_*` (iguais às de antes) e aparece `sunshine_name = Computador` (o nome padrão dos Ajustes; mude em **Ajustes > Nome** antes de preparar se quiser outro). Anote se alguma chave que existia sumiu: isso confirmaria a suposição (a) do topo do plano e deve virar um teste.

- [ ] **Step 4: Pareamento de verdade**

No notebook, no Moonlight, apague o desktop da lista e adicione de novo pelo IP, ou clique nele. Quando o Moonlight mostrar o PIN de 4 dígitos, digite esse PIN no campo da tela **Permitir** do Horizonte e clique **Permitir**.

Expected: o Horizonte mostra "Permitir o ...?" com o nome do notebook em até 2 segundos depois de o Moonlight pedir o PIN; com o PIN certo volta para "Pronto." e o Moonlight conclui o pareamento; com um PIN errado o Horizonte mostra um erro com "O PIN não confere".

- [ ] **Step 5: Sessão**

Inicie o stream do **Desktop** no Moonlight e depois encerre.

Expected: o Horizonte passa para "Tela estendida." com o nome do notebook ao conectar, e volta para "Pronto." ao encerrar. Anote o tempo de reação.

- [ ] **Step 6: Segunda preparação e cancelamento**

Feche e abra o app de novo e repita **Enviar a tela**. Expected: a segunda preparação é rápida (sem reiniciar o Sunshine). Depois, com um pedido de pareamento pendente, troque para **Mostrar**: o pedido não deve ficar pendurado no painel do Sunshine (`https://localhost:47990/pin`).

- [ ] **Step 7: Registrar os resultados e fechar**

Crie `docs/superpowers/plans/2026-10-02-horizonte-plano-2a-resultados.md` com: o que foi confirmado, o que divergiu, correções feitas (cada uma com o teste que falhou antes) e o que ficou para o Plano 2B. Rode a verificação final:

```powershell
cd app
npm run lint
npm run typecheck
npm test
npm run build
cd ..
git add docs app
git commit -m "docs: resultados da verificacao do motor Sunshine na maquina real"
```
