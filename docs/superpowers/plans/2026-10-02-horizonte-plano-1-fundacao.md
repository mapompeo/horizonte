# Horizonte, Plano 1: Fundação e telas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o app Horizonte rodando em Electron com as 10 telas aprovadas, a máquina de estados, os ajustes persistidos, a lógica de escolha de encoder e a ponte IPC, tudo funcionando sobre um motor de mentira (`FakeEngine`) que simula o fluxo completo.

**Architecture:** Um processo principal em Node/TypeScript guarda um `Controller` (máquina de estados pura mais efeitos que falam com um `EnginePort`) e expõe um snapshot por IPC. A interface em Svelte só renderiza o snapshot e manda eventos de usuário. O motor real (Sunshine/Moonlight) entra nos planos seguintes, trocando o `FakeEngine` por implementações reais atrás da mesma interface.

**Tech Stack:** Electron, electron-vite (template `svelte-ts`), TypeScript estrito, Svelte (escrito em sintaxe compatível com Svelte 4 e 5), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-horizonte-design.md`

**Protótipo visual de referência (versão polida):** https://claude.ai/artifact/UDyGX3BvagvETCiey4eYSX

## Escopo deste plano e roadmap

Este plano cobre da spec: a máquina de estados, as 10 telas e o modo escuro, o seletor Enviar | Mostrar a um clique, os ajustes (perfis, bitrate, Avançado), a escolha do encoder com queda para processador, e a ponte IPC.

Ficam para os próximos planos, cada um entregando software testável:

- **Plano 2:** servidor no Windows de ponta a ponta (instalar o Sunshine em versão fixa, monitor virtual, pareamento pela API do Sunshine, sondagem real do encoder).
- **Plano 3:** cliente no Windows (descoberta mDNS, Moonlight embutido, iniciar o stream).
- **Plano 4:** servidor no Linux (Xorg, monitor virtual por `xrandr`).
- **Plano 5:** empacotamento e instaladores.

Dois controles aparecem na interface, mas só ganham efeito depois, e isso é intencional: o interruptor **Abrir com o sistema** apenas grava a preferência (o efeito real vem com a interface `Autostart` no Plano 5), e o link **Adicionar pelo IP** ainda não abre nada (entra com a descoberta, no Plano 3). O botão **Instalar** só avança a tela, porque a instalação real do motor é do Plano 2.

## Global Constraints

- Idioma de toda a interface: português do Brasil. Sem travessões (`—`) em nenhum texto, nem em comentários.
- Stack fixa: Electron, TypeScript (`strict`), Svelte, Vitest. Sem outra biblioteca de interface.
- Plataformas da v1: Windows 11 e Ubuntu (Xorg). macOS é futuro: todo código que depende do sistema operacional fica em `src/main/platform/` atrás de interfaces (nenhum neste plano).
- Uma ação principal por tela. Botão primário preto em forma de pílula; Parar e Sair são contornados. Controles com no mínimo 44 px.
- Faixa de bitrate: 5 a 80 Mbps; padrão 30. Perfis: Econômico 10, Equilibrado 30, Máximo 60.
- Ordem de tentativa do encoder: GPU `lowlatency_high_quality`, GPU `transcoding`, processador. Nunca `ultralowlatency` nem `lowlatency` (a RX 580 do autor recusa).
- A interface nunca renderiza HTML vindo de fora: nomes de dispositivo são texto, limitados a 40 caracteres.
- O processo da interface só pode enviar ao principal os eventos da lista branca `INSTALL_DONE, CHOOSE, APPROVE, DENY, STOP, CONNECT, RETRY`.
- Commits: mensagem curta em português, no formato `feat: ...`, `test: ...` ou `chore: ...`. Nunca `Co-Authored-By` nem menção a IA.
- Licença do repositório: GPL-3.0.

## Review Focus

Entradas e falhas que a spec implica, mas nenhuma tarefa testaria só pelo caminho feliz. Cada linha tem o teste na tarefa indicada.

1. `settings.json` ausente, corrompido, parcial ou com valores inválidos deve voltar a padrões seguros e nunca derrubar o app (Tarefa 3).
2. Eventos que chegam no estado errado (pedido de pareamento durante uma conexão, aprovar duas vezes, fim de preparação depois de trocar de modo) são ignorados sem erro (Tarefas 2 e 5).
3. Sondagem de encoder que lança erro, lança de forma síncrona ou nunca responde deve terminar no processador dentro do tempo limite (Tarefa 4).
4. Bitrate nos limites, decimal, `NaN` ou absurdo, vindo do slider ou de um arquivo adulterado, deve virar um valor válido de 5 a 80 (Tarefa 3).
5. Trocar de modo várias vezes seguidas e uma preparação abandonada que falha depois não podem mostrar erro nem tela velha (Tarefa 5).
6. Nome de dispositivo hostil (HTML, controles, caracteres de direção invertida, vazio, enorme) aparece só como texto curto e seguro (Tarefa 7).

---

## Estrutura de arquivos

Tudo dentro de `app/` (criado na Tarefa 1). Pastas:

```
app/src/shared/            tipos e lógica pura usados pelos dois processos
  types.ts                 AppState, AppEvent, Settings, Snapshot...
  events.ts                lista branca de eventos da interface (isUiEvent)
  quality.ts               perfis e passos de bitrate
  api.ts                   canais IPC e contrato HorizonteApi
app/src/main/core/         núcleo do processo principal
  machine.ts               reduce(): transições da máquina de estados
  controller.ts            estado, efeitos e assinantes
  settings.ts              padrões, validação e persistência
  encoder.ts               escolha do encoder
app/src/main/engine/
  port.ts                  interface EnginePort
  fake.ts                  FakeEngine (motor de mentira)
app/src/main/dev-demo.ts   roteiro automático só para desenvolvimento
app/src/main/index.ts      janela, IPC, boot
app/src/preload/index.ts   ponte contextBridge
app/src/renderer/src/      interface Svelte
  lib/copy.ts              textos das telas (testado)
  lib/store.ts             snapshot e rota
  lib/actions.ts           funções que mandam eventos
  components/              Frame, TopBar, Pill, Stepper, Segmented, Toggle
  screens/                 uma tela por estado e a página de Ajustes
  assets/main.css          tokens e estilos
```

---

### Task 1: Esqueleto do projeto

**Files:**
- Create: `app/` (gerado pelo template), `app/vitest.config.ts`
- Modify: `app/package.json` (script `test`), `app/tsconfig.node.json`, `app/tsconfig.web.json` (incluir `src/shared`)

**Interfaces:**
- Produces: projeto que compila (`npm run typecheck` e `npm run build`) e roda testes (`npm test`).

- [ ] **Step 1: Gerar o projeto**

Na raiz do repositório (`C:\Users\mathe\dev\tela-extra`), no PowerShell:

```powershell
npm create @quick-start/electron@latest app -- --template svelte-ts --skip
```

Expected: cria a pasta `app/` com `package.json`, `electron.vite.config.ts`, `src/main`, `src/preload`, `src/renderer`. Se o assistente fizer perguntas mesmo com `--skip`, responda: nome `app`, framework `svelte`, TypeScript sim, ESLint sim, Prettier sim, updater não, proxy de download não.

- [ ] **Step 2: Instalar dependências e registrar as versões**

```powershell
cd app
npm install
npm ls svelte vite electron electron-vite --depth=0
```

Expected: instalação sem erro. Anote a versão principal do `svelte` (4 ou 5): a Tarefa 8 usa isso.

- [ ] **Step 3: Instalar o Vitest e criar a configuração**

```powershell
npm install -D vitest
```

Crie `app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
```

- [ ] **Step 4: Adicionar o script de teste**

Em `app/package.json`, dentro de `"scripts"`, acrescente a linha (mantendo os scripts existentes):

```json
"test": "vitest run",
```

- [ ] **Step 5: Incluir a pasta compartilhada nos dois tsconfig**

Em `app/tsconfig.node.json` e em `app/tsconfig.web.json`, acrescente `"src/shared/**/*"` ao array `include` (sem remover o que já existe). Em `tsconfig.web.json` confirme que `include` também tem `"src/renderer/src/**/*.svelte"`; se não tiver, acrescente.

- [ ] **Step 6: Verificar que o esqueleto compila**

```powershell
npm run typecheck
npm run build
```

Expected: os dois terminam sem erros. Se o `typecheck` já falhar no template puro, corrija só o necessário e anote o motivo na mensagem do commit.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add app
git commit -m "chore: esqueleto Electron, Svelte e TypeScript com Vitest"
```

Expected: `git status` limpo; `node_modules`, `out` e `dist` não aparecem no commit (o `.gitignore` do template cobre).

---

### Task 2: Tipos, lista branca de eventos e máquina de estados

**Files:**
- Create: `app/src/shared/types.ts`, `app/src/shared/events.ts`, `app/src/main/core/machine.ts`
- Test: `app/src/main/core/machine.test.ts`, `app/src/shared/events.test.ts`

**Interfaces:**
- Produces:
  - `type Mode = 'send' | 'receive'`; `type PrepStep = 'engine' | 'display' | 'encoder'`
  - `interface AppError { message: string; detail?: string }`
  - `type AppState` e `type AppEvent` (definidos abaixo)
  - `interface Settings`, `type SettingsPatch`, `interface Host`, `interface Snapshot`
  - `reduce(state: AppState, event: AppEvent): AppState` em `machine.ts`
  - `isUiEvent(value: unknown): value is AppEvent` em `events.ts`

- [ ] **Step 1: Escrever os tipos**

Crie `app/src/shared/types.ts`:

```ts
export type Mode = 'send' | 'receive'
export type PrepStep = 'engine' | 'display' | 'encoder'

export interface AppError {
  message: string
  detail?: string
}

export type AppState =
  | { screen: 'install' }
  | { screen: 'choose' }
  | { screen: 'preparing'; mode: 'send'; step: PrepStep }
  | { screen: 'ready'; mode: 'send' }
  | { screen: 'approve'; mode: 'send'; device: string }
  | { screen: 'connected'; mode: 'send'; device: string }
  | { screen: 'discover'; mode: 'receive' }
  | { screen: 'receiving'; mode: 'receive'; host: string }
  | { screen: 'error'; mode: Mode; error: AppError }

export type AppEvent =
  | { type: 'INSTALL_DONE' }
  | { type: 'CHOOSE'; mode: Mode }
  | { type: 'PREP_STEP'; step: PrepStep }
  | { type: 'PREP_DONE' }
  | { type: 'PAIR_REQUEST'; device: string }
  | { type: 'APPROVE' }
  | { type: 'DENY' }
  | { type: 'CLIENT_CONNECTED'; device: string }
  | { type: 'CLIENT_DISCONNECTED' }
  | { type: 'STOP' }
  | { type: 'CONNECT'; host: string }
  | { type: 'STREAM_ENDED' }
  | { type: 'FAIL'; error: AppError }
  | { type: 'RETRY' }

export type ProfileId = 'economico' | 'equilibrado' | 'maximo' | 'custom'
export type Resolution = '720p' | '1080p' | '1440p'
export type Fps = 30 | 60 | 120
export type Encoding = 'auto' | 'gpu' | 'cpu'
export type Codec = 'h264' | 'hevc' | 'av1'

export interface Settings {
  profile: ProfileId
  bitrate: number
  resolution: Resolution
  fps: Fps
  encoding: Encoding
  codec: Codec
  autostart: boolean
  deviceName: string
}

/** O perfil é sempre derivado do bitrate, por isso não pode ser alterado diretamente. */
export type SettingsPatch = Partial<Omit<Settings, 'profile'>>

export interface Host {
  name: string
  address: string
}

export interface Snapshot {
  state: AppState
  settings: Settings
}
```

- [ ] **Step 2: Escrever o teste da lista branca de eventos**

Crie `app/src/shared/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isUiEvent } from './events'

describe('isUiEvent', () => {
  it.each([
    { type: 'INSTALL_DONE' },
    { type: 'CHOOSE', mode: 'send' },
    { type: 'CHOOSE', mode: 'receive' },
    { type: 'APPROVE' },
    { type: 'DENY' },
    { type: 'STOP' },
    { type: 'RETRY' },
    { type: 'CONNECT', host: 'Desktop' }
  ])('aceita %o', (event) => {
    expect(isUiEvent(event)).toBe(true)
  })

  it.each([
    { type: 'PAIR_REQUEST', device: 'x' },
    { type: 'CLIENT_CONNECTED', device: 'x' },
    { type: 'CLIENT_DISCONNECTED' },
    { type: 'PREP_DONE' },
    { type: 'PREP_STEP', step: 'engine' },
    { type: 'STREAM_ENDED' },
    { type: 'FAIL', error: { message: 'x' } },
    { type: 'CHOOSE' },
    { type: 'CHOOSE', mode: 'qualquer' },
    { type: 'CONNECT' },
    { type: 'CONNECT', host: '' },
    { type: 'CONNECT', host: 5 },
    { type: 123 },
    {},
    null,
    undefined,
    'APPROVE',
    42,
    []
  ])('rejeita %o', (event) => {
    expect(isUiEvent(event)).toBe(false)
  })
})
```

- [ ] **Step 3: Escrever o teste da máquina de estados**

Crie `app/src/main/core/machine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reduce } from './machine'
import type { AppEvent, AppState } from '../../shared/types'

const preparing: AppState = { screen: 'preparing', mode: 'send', step: 'engine' }
const ready: AppState = { screen: 'ready', mode: 'send' }
const approve: AppState = { screen: 'approve', mode: 'send', device: 'Notebook' }
const connected: AppState = { screen: 'connected', mode: 'send', device: 'Notebook' }
const discover: AppState = { screen: 'discover', mode: 'receive' }
const receiving: AppState = { screen: 'receiving', mode: 'receive', host: 'Desktop' }
const failure = { message: 'Falhou', detail: 'detalhe' }

describe('reduce: caminho feliz', () => {
  const cases: [string, AppState, AppEvent, AppState][] = [
    ['instalação termina', { screen: 'install' }, { type: 'INSTALL_DONE' }, { screen: 'choose' }],
    ['escolher enviar', { screen: 'choose' }, { type: 'CHOOSE', mode: 'send' }, preparing],
    ['escolher mostrar', { screen: 'choose' }, { type: 'CHOOSE', mode: 'receive' }, discover],
    ['passo da preparação', preparing, { type: 'PREP_STEP', step: 'display' }, { ...preparing, step: 'display' }],
    ['preparação termina', preparing, { type: 'PREP_DONE' }, ready],
    ['pedido de pareamento', ready, { type: 'PAIR_REQUEST', device: 'Notebook' }, approve],
    ['aprovar', approve, { type: 'APPROVE' }, ready],
    ['recusar', approve, { type: 'DENY' }, ready],
    ['cliente conecta', ready, { type: 'CLIENT_CONNECTED', device: 'Notebook' }, connected],
    ['cliente desconecta', connected, { type: 'CLIENT_DISCONNECTED' }, ready],
    ['parar o envio', connected, { type: 'STOP' }, ready],
    ['conectar a um computador', discover, { type: 'CONNECT', host: 'Desktop' }, receiving],
    ['a transmissão acaba', receiving, { type: 'STREAM_ENDED' }, discover],
    ['sair', receiving, { type: 'STOP' }, discover]
  ]

  it.each(cases)('%s', (_name, from, event, to) => {
    expect(reduce(from, event)).toEqual(to)
  })
})

describe('reduce: troca de modo a um clique', () => {
  it('de enviar para mostrar a partir de qualquer tela do modo enviar', () => {
    for (const from of [preparing, ready, approve, connected]) {
      expect(reduce(from, { type: 'CHOOSE', mode: 'receive' })).toEqual(discover)
    }
  })

  it('de mostrar para enviar', () => {
    for (const from of [discover, receiving]) {
      expect(reduce(from, { type: 'CHOOSE', mode: 'send' })).toEqual(preparing)
    }
  })

  it('escolher o mesmo modo não reinicia nada', () => {
    expect(reduce(ready, { type: 'CHOOSE', mode: 'send' })).toBe(ready)
    expect(reduce(connected, { type: 'CHOOSE', mode: 'send' })).toBe(connected)
    expect(reduce(discover, { type: 'CHOOSE', mode: 'receive' })).toBe(discover)
  })

  it('sai de uma tela de erro ao escolher o outro modo', () => {
    const error: AppState = { screen: 'error', mode: 'send', error: failure }
    expect(reduce(error, { type: 'CHOOSE', mode: 'receive' })).toEqual(discover)
  })

  it('ignora a escolha de modo durante a instalação', () => {
    const install: AppState = { screen: 'install' }
    expect(reduce(install, { type: 'CHOOSE', mode: 'send' })).toBe(install)
  })
})

describe('reduce: erros', () => {
  it('qualquer estado vira erro com o modo atual', () => {
    expect(reduce(ready, { type: 'FAIL', error: failure })).toEqual({ screen: 'error', mode: 'send', error: failure })
    expect(reduce(receiving, { type: 'FAIL', error: failure })).toEqual({ screen: 'error', mode: 'receive', error: failure })
  })

  it('erro antes de escolher o modo assume enviar', () => {
    expect(reduce({ screen: 'install' }, { type: 'FAIL', error: failure })).toEqual({ screen: 'error', mode: 'send', error: failure })
  })

  it('um novo erro substitui o anterior', () => {
    const first: AppState = { screen: 'error', mode: 'send', error: failure }
    const next = reduce(first, { type: 'FAIL', error: { message: 'Outro' } })
    expect(next).toEqual({ screen: 'error', mode: 'send', error: { message: 'Outro' } })
  })

  it('tentar de novo volta ao início do modo', () => {
    expect(reduce({ screen: 'error', mode: 'send', error: failure }, { type: 'RETRY' })).toEqual(preparing)
    expect(reduce({ screen: 'error', mode: 'receive', error: failure }, { type: 'RETRY' })).toEqual(discover)
  })
})

describe('reduce: eventos no estado errado são ignorados', () => {
  const cases: [string, AppState, AppEvent][] = [
    ['pedido de pareamento durante uma conexão', connected, { type: 'PAIR_REQUEST', device: 'Intruso' }],
    ['pedido de pareamento com outro já pendente', approve, { type: 'PAIR_REQUEST', device: 'Outro' }],
    ['cliente conecta com pedido pendente', approve, { type: 'CLIENT_CONNECTED', device: 'Notebook' }],
    ['aprovar sem pedido', ready, { type: 'APPROVE' }],
    ['recusar sem pedido', ready, { type: 'DENY' }],
    ['fim da preparação já pronto', ready, { type: 'PREP_DONE' }],
    ['fim da preparação no modo mostrar', discover, { type: 'PREP_DONE' }],
    ['passo da preparação já pronto', ready, { type: 'PREP_STEP', step: 'display' }],
    ['aprovar durante a instalação', { screen: 'install' }, { type: 'APPROVE' }],
    ['passo antes de escolher', { screen: 'choose' }, { type: 'PREP_STEP', step: 'engine' }],
    ['conectar já recebendo', receiving, { type: 'CONNECT', host: 'Outro' }],
    ['conectar no modo enviar', ready, { type: 'CONNECT', host: 'Desktop' }],
    ['preparação termina em erro', { screen: 'error', mode: 'send', error: failure }, { type: 'PREP_DONE' }],
    ['parar sem conexão', ready, { type: 'STOP' }],
    ['transmissão acaba no modo enviar', ready, { type: 'STREAM_ENDED' }],
    ['tentar de novo sem erro', ready, { type: 'RETRY' }]
  ]

  it.each(cases)('%s', (_name, state, event) => {
    expect(reduce(state, event)).toBe(state)
  })
})
```

- [ ] **Step 4: Rodar os testes e ver falhar**

```powershell
cd app
npx vitest run src/shared/events.test.ts src/main/core/machine.test.ts
```

Expected: FAIL com erro de importação (`./events` e `./machine` não existem).

- [ ] **Step 5: Implementar a lista branca**

Crie `app/src/shared/events.ts`:

```ts
import type { AppEvent } from './types'

/**
 * Eventos que a interface pode mandar ao processo principal.
 * Os demais (pareamento, conexão, fim de preparação, erro) só nascem do motor.
 */
export function isUiEvent(value: unknown): value is AppEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  switch (candidate.type) {
    case 'INSTALL_DONE':
    case 'APPROVE':
    case 'DENY':
    case 'STOP':
    case 'RETRY':
      return true
    case 'CHOOSE':
      return candidate.mode === 'send' || candidate.mode === 'receive'
    case 'CONNECT':
      return typeof candidate.host === 'string' && candidate.host.length > 0
    default:
      return false
  }
}
```

- [ ] **Step 6: Implementar a máquina de estados**

Crie `app/src/main/core/machine.ts`:

```ts
import type { AppEvent, AppState, Mode } from '../../shared/types'

function startFor(mode: Mode): AppState {
  return mode === 'send'
    ? { screen: 'preparing', mode: 'send', step: 'engine' }
    : { screen: 'discover', mode: 'receive' }
}

function modeOf(state: AppState): Mode | null {
  return 'mode' in state ? state.mode : null
}

/** Função pura: devolve o mesmo objeto de `state` quando o evento não se aplica. */
export function reduce(state: AppState, event: AppEvent): AppState {
  if (event.type === 'FAIL') {
    return { screen: 'error', mode: modeOf(state) ?? 'send', error: event.error }
  }

  if (event.type === 'CHOOSE') {
    if (state.screen === 'install') return state
    if (state.screen === 'choose') return startFor(event.mode)
    return modeOf(state) === event.mode ? state : startFor(event.mode)
  }

  switch (state.screen) {
    case 'install':
      return event.type === 'INSTALL_DONE' ? { screen: 'choose' } : state
    case 'choose':
      return state
    case 'preparing':
      if (event.type === 'PREP_STEP') return { ...state, step: event.step }
      if (event.type === 'PREP_DONE') return { screen: 'ready', mode: 'send' }
      return state
    case 'ready':
      if (event.type === 'PAIR_REQUEST') return { screen: 'approve', mode: 'send', device: event.device }
      if (event.type === 'CLIENT_CONNECTED') return { screen: 'connected', mode: 'send', device: event.device }
      return state
    case 'approve':
      return event.type === 'APPROVE' || event.type === 'DENY' ? { screen: 'ready', mode: 'send' } : state
    case 'connected':
      return event.type === 'CLIENT_DISCONNECTED' || event.type === 'STOP' ? { screen: 'ready', mode: 'send' } : state
    case 'discover':
      return event.type === 'CONNECT' ? { screen: 'receiving', mode: 'receive', host: event.host } : state
    case 'receiving':
      return event.type === 'STREAM_ENDED' || event.type === 'STOP' ? { screen: 'discover', mode: 'receive' } : state
    case 'error':
      return event.type === 'RETRY' ? startFor(state.mode) : state
  }
}
```

- [ ] **Step 7: Rodar os testes e ver passar**

```powershell
npx vitest run src/shared/events.test.ts src/main/core/machine.test.ts
```

Expected: PASS em todos os casos (2 arquivos de teste).

- [ ] **Step 8: Provar um teste com mutação**

Em `machine.ts`, troque temporariamente `return event.type === 'APPROVE' || event.type === 'DENY' ? ...` por `return { screen: 'ready', mode: 'send' }` (aceita qualquer evento no estado `approve`) e rode `npx vitest run src/main/core/machine.test.ts`.

Expected: FAIL nos casos "pedido de pareamento com outro já pendente" e "cliente conecta com pedido pendente". Desfaça a mudança e rode de novo: PASS.

- [ ] **Step 9: Commit**

```powershell
cd ..
git add app/src/shared app/src/main/core
git commit -m "feat: tipos, lista branca de eventos e maquina de estados"
```

---

### Task 3: Qualidade e ajustes

**Files:**
- Create: `app/src/shared/quality.ts`, `app/src/main/core/settings.ts`
- Test: `app/src/shared/quality.test.ts`, `app/src/main/core/settings.test.ts`

**Interfaces:**
- Consumes: `ProfileId`, `Settings` de `shared/types.ts`.
- Produces:
  - `BITRATE_MIN = 5`, `BITRATE_MAX = 80`, `BITRATE_STEPS`, `PROFILES`
  - `clampBitrate(value: number): number`
  - `stepBitrate(current: number, direction: 1 | -1): number`
  - `profileFor(bitrate: number): ProfileId`
  - `DEFAULT_SETTINGS: Settings`
  - `parseSettings(raw: unknown): Settings`
  - `interface SettingsStore { load(): Promise<Settings>; save(settings: Settings): Promise<void> }`
  - `createSettingsStore(file: string): SettingsStore`

- [ ] **Step 1: Escrever o teste de qualidade**

Crie `app/src/shared/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BITRATE_MAX, BITRATE_MIN, PROFILES, clampBitrate, profileFor, stepBitrate } from './quality'

describe('clampBitrate', () => {
  it('mantém valores válidos', () => {
    expect(clampBitrate(30)).toBe(30)
  })

  it('arredonda decimais', () => {
    expect(clampBitrate(5.4)).toBe(5)
    expect(clampBitrate(33.6)).toBe(34)
  })

  it('limita aos extremos', () => {
    expect(clampBitrate(0)).toBe(BITRATE_MIN)
    expect(clampBitrate(-10)).toBe(BITRATE_MIN)
    expect(clampBitrate(1000)).toBe(BITRATE_MAX)
    expect(clampBitrate(Infinity)).toBe(PROFILES.equilibrado)
  })

  it('usa o padrão para valores que não são número', () => {
    expect(clampBitrate(NaN)).toBe(PROFILES.equilibrado)
  })
})

describe('stepBitrate', () => {
  it('sobe e desce pelos passos', () => {
    expect(stepBitrate(30, 1)).toBe(40)
    expect(stepBitrate(30, -1)).toBe(20)
  })

  it('não passa dos extremos', () => {
    expect(stepBitrate(80, 1)).toBe(80)
    expect(stepBitrate(5, -1)).toBe(5)
  })

  it('a partir de um valor fora dos passos vai para o vizinho', () => {
    expect(stepBitrate(33, 1)).toBe(40)
    expect(stepBitrate(33, -1)).toBe(30)
  })

  it('valores absurdos entram na faixa antes do passo', () => {
    expect(stepBitrate(1000, -1)).toBe(60)
    expect(stepBitrate(-5, 1)).toBe(10)
    expect(stepBitrate(NaN, 1)).toBe(40)
  })
})

describe('profileFor', () => {
  it('reconhece os perfis', () => {
    expect(profileFor(10)).toBe('economico')
    expect(profileFor(30)).toBe('equilibrado')
    expect(profileFor(60)).toBe('maximo')
  })

  it('qualquer outro valor é personalizado', () => {
    expect(profileFor(31)).toBe('custom')
    expect(profileFor(NaN)).toBe('equilibrado')
  })
})
```

- [ ] **Step 2: Escrever o teste dos ajustes**

Crie `app/src/main/core/settings.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, createSettingsStore, parseSettings } from './settings'

describe('parseSettings', () => {
  it('devolve os padrões para entradas que não são objeto', () => {
    for (const raw of [null, undefined, 'texto', 42, true, []]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('aceita um objeto completo e válido', () => {
    const raw = {
      bitrate: 50,
      resolution: '1440p',
      fps: 120,
      encoding: 'gpu',
      codec: 'hevc',
      autostart: false,
      deviceName: 'Notebook'
    }
    expect(parseSettings(raw)).toEqual({ ...raw, profile: 'custom' })
  })

  it('corrige valores inválidos campo a campo', () => {
    const result = parseSettings({
      bitrate: 999,
      resolution: '4k',
      fps: 59,
      encoding: 'quantum',
      codec: 'vp9',
      autostart: 'sim',
      deviceName: '   '
    })
    expect(result).toEqual({ ...DEFAULT_SETTINGS, bitrate: 80, profile: 'custom' })
  })

  it('o perfil sempre acompanha o bitrate', () => {
    expect(parseSettings({ bitrate: 10, profile: 'maximo' }).profile).toBe('economico')
  })

  it('descarta campos desconhecidos', () => {
    const result = parseSettings({ senha: 'x', bitrate: 30 }) as unknown as Record<string, unknown>
    expect('senha' in result).toBe(false)
  })

  it('limita o nome do computador a 40 caracteres', () => {
    expect(parseSettings({ deviceName: 'a'.repeat(100) }).deviceName).toHaveLength(40)
  })
})

describe('createSettingsStore', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'horizonte-'))
    file = join(dir, 'nested', 'settings.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('arquivo ausente devolve os padrões', async () => {
    expect(await createSettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('arquivo corrompido devolve os padrões', async () => {
    const store = createSettingsStore(file)
    await store.save(DEFAULT_SETTINGS)
    await writeFile(file, '{ isto não é json', 'utf8')
    expect(await store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('arquivo parcial completa com padrões', async () => {
    const store = createSettingsStore(file)
    await store.save(DEFAULT_SETTINGS)
    await writeFile(file, JSON.stringify({ fps: 30 }), 'utf8')
    expect(await store.load()).toEqual({ ...DEFAULT_SETTINGS, fps: 30 })
  })

  it('grava e lê de volta, criando as pastas', async () => {
    const store = createSettingsStore(file)
    const custom = parseSettings({ bitrate: 45, deviceName: 'Sala' })
    await store.save(custom)
    expect(await store.load()).toEqual(custom)
    expect(JSON.parse(await readFile(file, 'utf8')).deviceName).toBe('Sala')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/shared/quality.test.ts src/main/core/settings.test.ts
```

Expected: FAIL com erro de importação (`./quality` e `./settings` não existem).

- [ ] **Step 4: Implementar a qualidade**

Crie `app/src/shared/quality.ts`:

```ts
import type { ProfileId } from './types'

export const BITRATE_MIN = 5
export const BITRATE_MAX = 80
export const BITRATE_STEPS = [5, 10, 15, 20, 30, 40, 50, 60, 80] as const

export const PROFILES = { economico: 10, equilibrado: 30, maximo: 60 } as const

/** Entra na faixa válida, arredondando. Valores que não são número viram o padrão. */
export function clampBitrate(value: number): number {
  if (!Number.isFinite(value)) return PROFILES.equilibrado
  return Math.min(BITRATE_MAX, Math.max(BITRATE_MIN, Math.round(value)))
}

export function stepBitrate(current: number, direction: 1 | -1): number {
  const value = clampBitrate(current)
  if (direction === 1) {
    return BITRATE_STEPS.find((step) => step > value) ?? BITRATE_MAX
  }
  const lower = [...BITRATE_STEPS].reverse().find((step) => step < value)
  return lower ?? BITRATE_MIN
}

export function profileFor(bitrate: number): ProfileId {
  const value = clampBitrate(bitrate)
  if (value === PROFILES.economico) return 'economico'
  if (value === PROFILES.equilibrado) return 'equilibrado'
  if (value === PROFILES.maximo) return 'maximo'
  return 'custom'
}
```

- [ ] **Step 5: Implementar os ajustes**

Crie `app/src/main/core/settings.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { clampBitrate, profileFor } from '../../shared/quality'
import type { Codec, Encoding, Fps, Resolution, Settings } from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  profile: 'equilibrado',
  bitrate: 30,
  resolution: '1080p',
  fps: 60,
  encoding: 'auto',
  codec: 'h264',
  autostart: true,
  deviceName: 'Computador'
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Aceita qualquer entrada e sempre devolve ajustes válidos. */
export function parseSettings(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const bitrate = clampBitrate(typeof input.bitrate === 'number' ? input.bitrate : DEFAULT_SETTINGS.bitrate)
  const name = typeof input.deviceName === 'string' ? input.deviceName.trim().slice(0, 40) : ''

  return {
    bitrate,
    profile: profileFor(bitrate),
    resolution: oneOf<Resolution>(input.resolution, ['720p', '1080p', '1440p'], DEFAULT_SETTINGS.resolution),
    fps: oneOf<Fps>(input.fps, [30, 60, 120], DEFAULT_SETTINGS.fps),
    encoding: oneOf<Encoding>(input.encoding, ['auto', 'gpu', 'cpu'], DEFAULT_SETTINGS.encoding),
    codec: oneOf<Codec>(input.codec, ['h264', 'hevc', 'av1'], DEFAULT_SETTINGS.codec),
    autostart: typeof input.autostart === 'boolean' ? input.autostart : DEFAULT_SETTINGS.autostart,
    deviceName: name || DEFAULT_SETTINGS.deviceName
  }
}

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
}

export function createSettingsStore(file: string): SettingsStore {
  return {
    async load() {
      try {
        return parseSettings(JSON.parse(await readFile(file, 'utf8')))
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },
    async save(settings) {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.tmp`
      await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8')
      await rename(temporary, file)
    }
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

```powershell
npx vitest run src/shared/quality.test.ts src/main/core/settings.test.ts
```

Expected: PASS em todos.

- [ ] **Step 7: Provar com mutação**

Em `quality.ts`, troque temporariamente `if (!Number.isFinite(value)) return PROFILES.equilibrado` por `if (Number.isNaN(value)) return PROFILES.equilibrado` e rode `npx vitest run src/shared/quality.test.ts`.

Expected: FAIL em "limita aos extremos" (o caso `Infinity`). Desfaça e rode de novo: PASS.

- [ ] **Step 8: Commit**

```powershell
cd ..
git add app/src/shared/quality.ts app/src/shared/quality.test.ts app/src/main/core/settings.ts app/src/main/core/settings.test.ts
git commit -m "feat: perfis de qualidade e ajustes persistidos com validacao"
```

---

### Task 4: Escolha do encoder

**Files:**
- Create: `app/src/main/core/encoder.ts`
- Test: `app/src/main/core/encoder.test.ts`

**Interfaces:**
- Consumes: `Encoding` de `shared/types.ts`.
- Produces:
  - `interface EncoderCandidate { id: string; kind: 'gpu' | 'cpu'; amdUsage?: 'lowlatency_high_quality' | 'transcoding' }`
  - `GPU_ENCODERS: readonly EncoderCandidate[]`, `CPU_ENCODER: EncoderCandidate`
  - `type Probe = (candidate: EncoderCandidate) => Promise<boolean>`
  - `interface ChosenEncoder { candidate: EncoderCandidate; fellBack: boolean }`
  - `chooseEncoder(probe: Probe, preference?: Encoding, timeoutMs?: number): Promise<ChosenEncoder>`

- [ ] **Step 1: Escrever o teste**

Crie `app/src/main/core/encoder.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CPU_ENCODER, chooseEncoder, type EncoderCandidate, type Probe } from './encoder'

afterEach(() => {
  vi.useRealTimers()
})

describe('chooseEncoder', () => {
  it('usa a primeira opção de GPU que abre', async () => {
    const tried: string[] = []
    const result = await chooseEncoder(async (candidate) => {
      tried.push(candidate.id)
      return true
    })
    expect(result.candidate.id).toBe('gpu-lowlatency_high_quality')
    expect(result.fellBack).toBe(false)
    expect(tried).toEqual(['gpu-lowlatency_high_quality'])
  })

  it('cai para transcoding quando lowlatency é recusado', async () => {
    const result = await chooseEncoder(async (candidate) => candidate.amdUsage === 'transcoding')
    expect(result.candidate.id).toBe('gpu-transcoding')
    expect(result.fellBack).toBe(false)
  })

  it('cai para o processador quando nenhuma GPU abre', async () => {
    const result = await chooseEncoder(async () => false)
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })

  it('erro lançado pela sondagem conta como falha', async () => {
    const probe: Probe = async () => {
      throw new Error('driver')
    }
    const result = await chooseEncoder(probe)
    expect(result.candidate).toEqual(CPU_ENCODER)
  })

  it('erro síncrono na sondagem conta como falha', async () => {
    const probe = ((_candidate: EncoderCandidate) => {
      throw new Error('boom')
    }) as Probe
    const result = await chooseEncoder(probe)
    expect(result.candidate).toEqual(CPU_ENCODER)
  })

  it('o processador nunca é sondado', async () => {
    const tried: string[] = []
    await chooseEncoder(async (candidate) => {
      tried.push(candidate.id)
      return false
    })
    expect(tried).not.toContain('cpu')
  })

  it('sondagem que nunca responde vira falha depois do tempo limite', async () => {
    vi.useFakeTimers()
    const pending = chooseEncoder(() => new Promise<boolean>(() => {}), 'auto', 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    const result = await pending
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })

  it('preferência por processador não sonda nada', async () => {
    let calls = 0
    const result = await chooseEncoder(async () => {
      calls++
      return true
    }, 'cpu')
    expect(calls).toBe(0)
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(false)
  })

  it('preferência por GPU que falha tudo ainda termina no processador', async () => {
    const result = await chooseEncoder(async () => false, 'gpu')
    expect(result.candidate).toEqual(CPU_ENCODER)
    expect(result.fellBack).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/core/encoder.test.ts
```

Expected: FAIL (`./encoder` não existe).

- [ ] **Step 3: Implementar**

Crie `app/src/main/core/encoder.ts`:

```ts
import type { Encoding } from '../../shared/types'

export interface EncoderCandidate {
  id: string
  kind: 'gpu' | 'cpu'
  amdUsage?: 'lowlatency_high_quality' | 'transcoding'
}

/**
 * Ordem aprendida na prática: a RX 580 recusa `lowlatency` e `ultralowlatency`,
 * mas aceita `lowlatency_high_quality` e `transcoding`.
 */
export const GPU_ENCODERS: readonly EncoderCandidate[] = [
  { id: 'gpu-lowlatency_high_quality', kind: 'gpu', amdUsage: 'lowlatency_high_quality' },
  { id: 'gpu-transcoding', kind: 'gpu', amdUsage: 'transcoding' }
]

export const CPU_ENCODER: EncoderCandidate = { id: 'cpu', kind: 'cpu' }

export type Probe = (candidate: EncoderCandidate) => Promise<boolean>

export interface ChosenEncoder {
  candidate: EncoderCandidate
  /** Verdadeiro quando o processador foi usado sem que o usuário o tivesse pedido. */
  fellBack: boolean
}

function attempt(probe: Probe, candidate: EncoderCandidate, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    const finish = (ok: boolean): void => {
      clearTimeout(timer)
      resolve(ok)
    }
    Promise.resolve()
      .then(() => probe(candidate))
      .then((ok) => finish(ok === true), () => finish(false))
  })
}

export async function chooseEncoder(
  probe: Probe,
  preference: Encoding = 'auto',
  timeoutMs = 8000
): Promise<ChosenEncoder> {
  if (preference === 'cpu') return { candidate: CPU_ENCODER, fellBack: false }

  for (const candidate of GPU_ENCODERS) {
    if (await attempt(probe, candidate, timeoutMs)) return { candidate, fellBack: false }
  }
  return { candidate: CPU_ENCODER, fellBack: true }
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/main/core/encoder.test.ts
```

Expected: PASS nos 9 casos.

- [ ] **Step 5: Provar com mutação**

Em `encoder.ts`, troque temporariamente `() => finish(false)` por `() => finish(true)` (erro vira sucesso) e rode `npx vitest run src/main/core/encoder.test.ts`.

Expected: FAIL em "erro lançado pela sondagem conta como falha" e "erro síncrono na sondagem conta como falha". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/main/core/encoder.ts app/src/main/core/encoder.test.ts
git commit -m "feat: escolha do encoder com queda para o processador"
```

---

### Task 5: Motor de mentira e controlador

**Files:**
- Create: `app/src/main/engine/port.ts`, `app/src/main/engine/fake.ts`, `app/src/main/core/controller.ts`
- Test: `app/src/main/core/controller.test.ts`

**Interfaces:**
- Consumes: `reduce` (Tarefa 2), `parseSettings`, `SettingsStore` (Tarefa 3).
- Produces:
  - `interface EnginePort` (abaixo) e `class FakeEngine implements EnginePort`
  - `FakeEngine`: campos `calls: string[]`, `failPrepare: string | null`, `failConnect: string | null`, `hosts: Host[]`; métodos `simulatePairRequest(device)`, `simulateClientConnected(device)`, `simulateClientDisconnected()`, `simulateStreamEnded()`
  - `interface Controller { getSnapshot(): Snapshot; dispatch(event: AppEvent): void; updateSettings(patch: SettingsPatch): Promise<Settings>; listHosts(): Promise<Host[]>; subscribe(listener: (snapshot: Snapshot) => void): () => void }`
  - `createController(deps: { engine: EnginePort; store: SettingsStore; initial?: AppState }): Promise<Controller>`

- [ ] **Step 1: Escrever a interface do motor**

Crie `app/src/main/engine/port.ts`:

```ts
import type { Host, PrepStep, Settings } from '../../shared/types'

export interface EngineEvents {
  onPairRequest(callback: (device: string) => void): () => void
  onClientConnected(callback: (device: string) => void): () => void
  onClientDisconnected(callback: () => void): () => void
  onStreamEnded(callback: () => void): () => void
}

/** Tudo que o núcleo precisa do motor de streaming. Os planos seguintes trazem as implementações reais. */
export interface EnginePort extends EngineEvents {
  prepare(onStep: (step: PrepStep) => void, settings: Settings): Promise<void>
  approve(): Promise<void>
  deny(): Promise<void>
  stopSending(): Promise<void>
  listHosts(): Promise<Host[]>
  connect(host: string, settings: Settings): Promise<void>
  disconnect(): Promise<void>
  applyBitrate(mbps: number): Promise<void>
}
```

- [ ] **Step 2: Implementar o motor de mentira**

Crie `app/src/main/engine/fake.ts`:

```ts
import type { Host, PrepStep } from '../../shared/types'
import type { EnginePort } from './port'

type Callback<A extends unknown[]> = (...args: A) => void

function emitter<A extends unknown[]>(): {
  on(callback: Callback<A>): () => void
  emit(...args: A): void
} {
  const subscribers = new Set<Callback<A>>()
  return {
    on(callback) {
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
    emit(...args) {
      for (const callback of [...subscribers]) callback(...args)
    }
  }
}

/** Motor de mentira: simula o fluxo para desenvolver a interface e testar o núcleo. */
export class FakeEngine implements EnginePort {
  calls: string[] = []
  failPrepare: string | null = null
  failConnect: string | null = null
  hosts: Host[] = [{ name: 'Desktop', address: '192.168.1.3' }]

  private pair = emitter<[string]>()
  private connected = emitter<[string]>()
  private disconnected = emitter<[]>()
  private ended = emitter<[]>()

  constructor(private readonly delayMs = 0) {}

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs))
  }

  async prepare(onStep: (step: PrepStep) => void): Promise<void> {
    this.calls.push('prepare')
    for (const step of ['engine', 'display', 'encoder'] as const) {
      onStep(step)
      await this.wait()
    }
    if (this.failPrepare) {
      const message = this.failPrepare
      this.failPrepare = null
      throw new Error(message)
    }
  }

  async approve(): Promise<void> {
    this.calls.push('approve')
  }

  async deny(): Promise<void> {
    this.calls.push('deny')
  }

  async stopSending(): Promise<void> {
    this.calls.push('stopSending')
  }

  async listHosts(): Promise<Host[]> {
    return this.hosts
  }

  async connect(host: string): Promise<void> {
    this.calls.push(`connect:${host}`)
    await this.wait()
    if (this.failConnect) {
      const message = this.failConnect
      this.failConnect = null
      throw new Error(message)
    }
  }

  async disconnect(): Promise<void> {
    this.calls.push('disconnect')
  }

  async applyBitrate(mbps: number): Promise<void> {
    this.calls.push(`bitrate:${mbps}`)
  }

  onPairRequest(callback: (device: string) => void): () => void {
    return this.pair.on(callback)
  }

  onClientConnected(callback: (device: string) => void): () => void {
    return this.connected.on(callback)
  }

  onClientDisconnected(callback: () => void): () => void {
    return this.disconnected.on(callback)
  }

  onStreamEnded(callback: () => void): () => void {
    return this.ended.on(callback)
  }

  simulatePairRequest(device: string): void {
    this.pair.emit(device)
  }

  simulateClientConnected(device: string): void {
    this.connected.emit(device)
  }

  simulateClientDisconnected(): void {
    this.disconnected.emit()
  }

  simulateStreamEnded(): void {
    this.ended.emit()
  }
}
```

- [ ] **Step 3: Escrever o teste do controlador**

Crie `app/src/main/core/controller.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createController, type Controller } from './controller'
import { DEFAULT_SETTINGS, type SettingsStore } from './settings'
import { FakeEngine } from '../engine/fake'
import type { AppState, Settings } from '../../shared/types'

function memoryStore(): { store: SettingsStore; saved: Settings[] } {
  const saved: Settings[] = []
  const store: SettingsStore = {
    load: async () => ({ ...DEFAULT_SETTINGS }),
    save: async (settings) => {
      saved.push(settings)
    }
  }
  return { store, saved }
}

async function setup(initial: AppState, engine = new FakeEngine(0)) {
  const { store, saved } = memoryStore()
  const controller = await createController({ engine, store, initial })
  return { controller, engine, saved }
}

const screen = (controller: Controller): string => controller.getSnapshot().state.screen
const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('fluxo de envio', () => {
  it('instala, escolhe enviar, prepara, aprova e conecta', async () => {
    const { controller, engine } = await setup({ screen: 'install' })

    controller.dispatch({ type: 'INSTALL_DONE' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(screen(controller)).toBe('preparing')
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))

    engine.simulatePairRequest('Notebook')
    expect(controller.getSnapshot().state).toEqual({ screen: 'approve', mode: 'send', device: 'Notebook' })

    controller.dispatch({ type: 'APPROVE' })
    expect(engine.calls).toContain('approve')
    expect(screen(controller)).toBe('ready')

    engine.simulateClientConnected('Notebook')
    expect(screen(controller)).toBe('connected')

    controller.dispatch({ type: 'STOP' })
    expect(screen(controller)).toBe('ready')
    expect(engine.calls).toContain('stopSending')
  })

  it('recusar avisa o motor', async () => {
    const { controller, engine } = await setup({ screen: 'approve', mode: 'send', device: 'Notebook' })
    controller.dispatch({ type: 'DENY' })
    expect(engine.calls).toContain('deny')
    expect(screen(controller)).toBe('ready')
  })

  it('cliente que desconecta volta para pronto sem parar o motor de novo', async () => {
    const { controller, engine } = await setup({ screen: 'connected', mode: 'send', device: 'Notebook' })
    engine.simulateClientDisconnected()
    expect(screen(controller)).toBe('ready')
    expect(engine.calls).not.toContain('stopSending')
  })
})

describe('fluxo de recebimento', () => {
  it('escolhe mostrar, conecta e sai', async () => {
    const { controller, engine } = await setup({ screen: 'choose' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    expect(screen(controller)).toBe('discover')

    controller.dispatch({ type: 'CONNECT', host: 'Desktop' })
    expect(controller.getSnapshot().state).toEqual({ screen: 'receiving', mode: 'receive', host: 'Desktop' })
    expect(engine.calls).toContain('connect:Desktop')

    controller.dispatch({ type: 'STOP' })
    expect(screen(controller)).toBe('discover')
    expect(engine.calls).toContain('disconnect')
  })

  it('lista os computadores da rede', async () => {
    const { controller } = await setup({ screen: 'discover', mode: 'receive' })
    expect(await controller.listHosts()).toEqual([{ name: 'Desktop', address: '192.168.1.3' }])
  })

  it('falha ao conectar mostra erro com o detalhe', async () => {
    const engine = new FakeEngine(0)
    engine.failConnect = 'sem rede'
    const { controller } = await setup({ screen: 'discover', mode: 'receive' }, engine)
    controller.dispatch({ type: 'CONNECT', host: 'Desktop' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))
    const state = controller.getSnapshot().state
    expect(state.screen === 'error' && state.error.detail).toBe('sem rede')
  })
})

describe('erros', () => {
  it('falha ao preparar mostra erro e tentar de novo funciona', async () => {
    const engine = new FakeEngine(0)
    engine.failPrepare = 'sem permissão'
    const { controller } = await setup({ screen: 'choose' }, engine)

    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))

    controller.dispatch({ type: 'RETRY' })
    expect(screen(controller)).toBe('preparing')
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))
  })
})

describe('eventos no estado errado', () => {
  it('aprovar duas vezes avisa o motor uma vez só', async () => {
    const { controller, engine } = await setup({ screen: 'approve', mode: 'send', device: 'Notebook' })
    controller.dispatch({ type: 'APPROVE' })
    controller.dispatch({ type: 'APPROVE' })
    expect(engine.calls.filter((call) => call === 'approve')).toHaveLength(1)
  })

  it('pedido de pareamento durante uma conexão é ignorado', async () => {
    const { controller, engine } = await setup({ screen: 'connected', mode: 'send', device: 'Notebook' })
    engine.simulatePairRequest('Intruso')
    expect(controller.getSnapshot().state).toEqual({ screen: 'connected', mode: 'send', device: 'Notebook' })
  })

  it('eventos do modo enviar no modo mostrar são ignorados', async () => {
    const { controller, engine } = await setup({ screen: 'discover', mode: 'receive' })
    engine.simulateClientConnected('Notebook')
    engine.simulatePairRequest('Notebook')
    expect(screen(controller)).toBe('discover')
  })
})

describe('troca de modo', () => {
  it('sair de conectado para mostrar para o envio', async () => {
    const { controller, engine } = await setup({ screen: 'connected', mode: 'send', device: 'Notebook' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    expect(screen(controller)).toBe('discover')
    expect(engine.calls).toContain('stopSending')
  })

  it('sair de recebendo para enviar encerra a conexão', async () => {
    const { controller, engine } = await setup({ screen: 'receiving', mode: 'receive', host: 'Desktop' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(screen(controller)).toBe('preparing')
    expect(engine.calls).toContain('disconnect')
  })

  it('enviar, mostrar, enviar termina pronto e sem erro', async () => {
    const { controller, engine } = await setup({ screen: 'choose' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))
    await settle()
    expect(screen(controller)).toBe('ready')
    expect(engine.calls.filter((call) => call === 'prepare')).toHaveLength(2)
  })

  it('a falha de uma preparação abandonada não mostra erro', async () => {
    const engine = new FakeEngine(0)
    engine.failPrepare = 'tarde demais'
    const { controller } = await setup({ screen: 'choose' }, engine)
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    await settle()
    expect(controller.getSnapshot().state).toEqual({ screen: 'discover', mode: 'receive' })
  })

  it('o fim de uma preparação abandonada não tira o usuário da tela atual', async () => {
    const { controller } = await setup({ screen: 'choose' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    await settle()
    expect(screen(controller)).toBe('discover')
  })
})

describe('ajustes e assinantes', () => {
  it('atualizar o bitrate valida, persiste e avisa os assinantes', async () => {
    const { controller, saved } = await setup({ screen: 'ready', mode: 'send' })
    const seen: number[] = []
    controller.subscribe((snapshot) => seen.push(snapshot.settings.bitrate))

    const next = await controller.updateSettings({ bitrate: 33.4 })
    expect(next.bitrate).toBe(33)
    expect(next.profile).toBe('custom')
    expect(saved[saved.length - 1]?.bitrate).toBe(33)
    expect(seen).toEqual([33])
  })

  it('o perfil não pode ser forçado pelo patch', async () => {
    const { controller } = await setup({ screen: 'ready', mode: 'send' })
    const next = await controller.updateSettings({ profile: 'maximo', bitrate: 10 } as never)
    expect(next.profile).toBe('economico')
  })

  it('aplica o bitrate ao vivo quando há conexão', async () => {
    const { controller, engine } = await setup({ screen: 'connected', mode: 'send', device: 'Notebook' })
    await controller.updateSettings({ bitrate: 50 })
    expect(engine.calls).toContain('bitrate:50')
  })

  it('não mexe no motor quando não há conexão', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    await controller.updateSettings({ bitrate: 50 })
    expect(engine.calls.some((call) => call.startsWith('bitrate:'))).toBe(false)
  })

  it('quem cancela a assinatura deixa de receber', async () => {
    const { controller } = await setup({ screen: 'ready', mode: 'send' })
    let count = 0
    const stop = controller.subscribe(() => count++)
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    stop()
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/main/core/controller.test.ts
```

Expected: FAIL (`./controller` não existe).

- [ ] **Step 5: Implementar o controlador**

Crie `app/src/main/core/controller.ts`:

```ts
import type { AppEvent, AppState, Host, Settings, SettingsPatch, Snapshot } from '../../shared/types'
import type { EnginePort } from '../engine/port'
import { reduce } from './machine'
import { parseSettings, type SettingsStore } from './settings'

export interface ControllerDeps {
  engine: EnginePort
  store: SettingsStore
  initial?: AppState
}

export interface Controller {
  getSnapshot(): Snapshot
  dispatch(event: AppEvent): void
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  subscribe(listener: (snapshot: Snapshot) => void): () => void
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export async function createController({
  engine,
  store,
  initial = { screen: 'install' }
}: ControllerDeps): Promise<Controller> {
  let state: AppState = initial
  let settings = await store.load()
  /** Cada preparação recebe um número; só a mais recente pode mexer no estado. */
  let prepareRun = 0
  const listeners = new Set<(snapshot: Snapshot) => void>()

  const snapshot = (): Snapshot => ({ state, settings })

  function notify(): void {
    const current = snapshot()
    for (const listener of [...listeners]) listener(current)
  }

  function fail(message: string, cause: unknown): void {
    dispatch({ type: 'FAIL', error: { message, detail: describeError(cause) } })
  }

  function runEffects(prev: AppState, next: AppState, event: AppEvent): void {
    // Sair da preparação por qualquer caminho abandona a execução em andamento.
    if (prev.screen === 'preparing' && next.screen !== 'preparing') prepareRun++

    if (next.screen === 'preparing' && prev.screen !== 'preparing') {
      const run = ++prepareRun
      const live = (): boolean => run === prepareRun
      engine
        .prepare((step) => {
          if (live()) dispatch({ type: 'PREP_STEP', step })
        }, settings)
        .then(() => {
          if (live()) dispatch({ type: 'PREP_DONE' })
        })
        .catch((cause: unknown) => {
          if (live()) fail('Não consegui preparar este computador.', cause)
        })
    }

    if (prev.screen === 'approve' && next.screen === 'ready') {
      const answer = event.type === 'APPROVE' ? engine.approve() : engine.deny()
      answer.catch((cause: unknown) => fail('Não consegui responder ao pedido.', cause))
    }

    if (prev.screen === 'connected' && next.screen !== 'connected' && event.type !== 'CLIENT_DISCONNECTED') {
      engine.stopSending().catch((cause: unknown) => fail('Não consegui parar o envio.', cause))
    }

    if (next.screen === 'receiving' && prev.screen !== 'receiving') {
      engine.connect(next.host, settings).catch((cause: unknown) => {
        if (state.screen === 'receiving') fail('Não consegui conectar a esse computador.', cause)
      })
    }

    if (prev.screen === 'receiving' && next.screen !== 'receiving' && event.type !== 'STREAM_ENDED') {
      engine.disconnect().catch((cause: unknown) => fail('Não consegui encerrar a conexão.', cause))
    }
  }

  function dispatch(event: AppEvent): void {
    const prev = state
    const next = reduce(prev, event)
    if (next === prev) return
    state = next
    notify()
    runEffects(prev, next, event)
  }

  engine.onPairRequest((device) => dispatch({ type: 'PAIR_REQUEST', device }))
  engine.onClientConnected((device) => dispatch({ type: 'CLIENT_CONNECTED', device }))
  engine.onClientDisconnected(() => dispatch({ type: 'CLIENT_DISCONNECTED' }))
  engine.onStreamEnded(() => dispatch({ type: 'STREAM_ENDED' }))

  return {
    getSnapshot: snapshot,
    dispatch,
    async updateSettings(patch) {
      settings = parseSettings({ ...settings, ...patch })
      await store.save(settings)
      notify()
      if (state.screen === 'connected' || state.screen === 'receiving') {
        // Ajuste ao vivo é melhor esforço: se falhar, a conexão segue com o valor anterior.
        await engine.applyBitrate(settings.bitrate).catch(() => undefined)
      }
      return settings
    },
    listHosts: () => engine.listHosts(),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

```powershell
npx vitest run src/main/core/controller.test.ts
```

Expected: PASS em todos os casos. Se "enviar, mostrar, enviar termina pronto" oscilar por tempo, aumente o argumento padrão de `settle` para 80 ms.

- [ ] **Step 7: Provar com mutação**

Em `controller.ts`, remova temporariamente a linha `if (prev.screen === 'preparing' && next.screen !== 'preparing') prepareRun++` e rode `npx vitest run src/main/core/controller.test.ts`.

Expected: FAIL em "a falha de uma preparação abandonada não mostra erro". Desfaça e rode de novo: PASS.

- [ ] **Step 8: Commit**

```powershell
cd ..
git add app/src/main/engine app/src/main/core/controller.ts app/src/main/core/controller.test.ts
git commit -m "feat: motor de mentira e controlador com efeitos"
```

---

### Task 6: Janela, IPC e ponte

**Files:**
- Create: `app/src/shared/api.ts`, `app/src/main/dev-demo.ts`
- Modify: `app/src/main/index.ts`, `app/src/preload/index.ts`, `app/src/preload/index.d.ts`

**Interfaces:**
- Consumes: `createController`, `createSettingsStore`, `FakeEngine`, `isUiEvent`.
- Produces:
  - `CHANNELS` e `interface HorizonteApi { getSnapshot(): Promise<Snapshot>; dispatch(event: AppEvent): Promise<void>; updateSettings(patch: SettingsPatch): Promise<Settings>; listHosts(): Promise<Host[]>; onSnapshot(callback: (snapshot: Snapshot) => void): () => void }`
  - `window.horizonte` disponível na interface

- [ ] **Step 1: Escrever o contrato da API**

Crie `app/src/shared/api.ts`:

```ts
import type { AppEvent, Host, Settings, SettingsPatch, Snapshot } from './types'

export const CHANNELS = {
  snapshot: 'horizonte:snapshot',
  dispatch: 'horizonte:dispatch',
  updateSettings: 'horizonte:update-settings',
  hosts: 'horizonte:hosts',
  push: 'horizonte:push'
} as const

export interface HorizonteApi {
  getSnapshot(): Promise<Snapshot>
  dispatch(event: AppEvent): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void
}

declare global {
  interface Window {
    horizonte: HorizonteApi
  }
}
```

- [ ] **Step 2: Escrever a ponte do preload**

Substitua o conteúdo de `app/src/preload/index.ts` por:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type HorizonteApi } from '../shared/api'
import type { Snapshot } from '../shared/types'

const api: HorizonteApi = {
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.snapshot),
  dispatch: (event) => ipcRenderer.invoke(CHANNELS.dispatch, event),
  updateSettings: (patch) => ipcRenderer.invoke(CHANNELS.updateSettings, patch),
  listHosts: () => ipcRenderer.invoke(CHANNELS.hosts),
  onSnapshot: (callback) => {
    const handler = (_event: unknown, snapshot: Snapshot): void => callback(snapshot)
    ipcRenderer.on(CHANNELS.push, handler)
    return () => {
      ipcRenderer.removeListener(CHANNELS.push, handler)
    }
  }
}

contextBridge.exposeInMainWorld('horizonte', api)
```

Substitua o conteúdo de `app/src/preload/index.d.ts` por (a declaração global agora vem de `shared/api.ts`):

```ts
export {}
```

- [ ] **Step 3: Escrever o roteiro de demonstração (só desenvolvimento)**

Crie `app/src/main/dev-demo.ts`:

```ts
import type { Controller } from './core/controller'
import type { FakeEngine } from './engine/fake'

/** Roteiro automático para ver o fluxo de envio sem um segundo computador. Só roda fora do app empacotado. */
export function runDevDemo(controller: Controller, engine: FakeEngine): void {
  let pairRequested = false
  let connectedOnce = false

  controller.subscribe(({ state }) => {
    if (state.screen !== 'ready') return

    if (!pairRequested) {
      pairRequested = true
      setTimeout(() => engine.simulatePairRequest('Notebook'), 3000)
      return
    }

    if (!connectedOnce) {
      setTimeout(() => {
        if (connectedOnce || !engine.calls.includes('approve')) return
        connectedOnce = true
        engine.simulateClientConnected('Notebook')
      }, 1500)
    }
  })
}
```

- [ ] **Step 4: Escrever o processo principal**

Abra o `app/src/main/index.ts` gerado e anote como ele localiza o preload e carrega o renderer (no template padrão: `join(__dirname, '../preload/index.js')`, `process.env['ELECTRON_RENDERER_URL']` e `join(__dirname, '../renderer/index.html')`). Substitua todo o conteúdo por abaixo, mantendo as expressões do seu template se forem diferentes (por exemplo `index.mjs`):

```ts
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { CHANNELS } from '../shared/api'
import { isUiEvent } from '../shared/events'
import type { SettingsPatch } from '../shared/types'
import { createController, type Controller } from './core/controller'
import { createSettingsStore } from './core/settings'
import { runDevDemo } from './dev-demo'
import { FakeEngine } from './engine/fake'

function createWindow(controller: Controller): void {
  const window = new BrowserWindow({
    title: 'Horizonte',
    width: 760,
    height: 580,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101012' : '#FBFBFD',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const unsubscribe = controller.subscribe((snapshot) => {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.push, snapshot)
  })
  window.on('closed', unsubscribe)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function boot(): Promise<void> {
  await app.whenReady()
  electronApp.setAppUserModelId('com.horizonte.app')
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  const store = createSettingsStore(join(app.getPath('userData'), 'settings.json'))
  const engine = new FakeEngine(is.dev ? 700 : 0)
  const controller = await createController({ engine, store })
  if (!app.isPackaged) runDevDemo(controller, engine)

  ipcMain.handle(CHANNELS.snapshot, () => controller.getSnapshot())
  ipcMain.handle(CHANNELS.dispatch, (_event, payload: unknown) => {
    if (isUiEvent(payload)) controller.dispatch(payload)
  })
  ipcMain.handle(CHANNELS.updateSettings, (_event, patch: unknown) =>
    controller.updateSettings((typeof patch === 'object' && patch !== null ? patch : {}) as SettingsPatch)
  )
  ipcMain.handle(CHANNELS.hosts, () => controller.listHosts())

  createWindow(controller)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(controller)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

void boot()
```

- [ ] **Step 5: Verificar tipos e compilação**

```powershell
cd app
npm run typecheck:node
npm run build
```

Expected: sem erros. Depois do build, confira o nome real do preload com `ls out/preload`: se for `index.mjs`, troque `'../preload/index.js'` por `'../preload/index.mjs'` em `index.ts` e rode o build de novo.

- [ ] **Step 6: Verificar que o preload carrega**

```powershell
npm run dev
```

Expected: a janela abre (a interface ainda é a do template). Abra o DevTools (`Ctrl+Shift+I`) e execute `window.horizonte` no console: deve mostrar um objeto com `getSnapshot`, `dispatch`, `updateSettings`, `listHosts` e `onSnapshot`. Execute `await window.horizonte.getSnapshot()`: deve devolver `{ state: { screen: 'install' }, settings: {...} }`. Feche o app.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add app/src/shared/api.ts app/src/preload app/src/main/index.ts app/src/main/dev-demo.ts
git commit -m "feat: janela, ponte IPC e roteiro de demonstracao"
```

---

### Task 7: Textos das telas

**Files:**
- Create: `app/src/renderer/src/lib/copy.ts`
- Test: `app/src/renderer/src/lib/copy.test.ts`

**Interfaces:**
- Consumes: `AppState`, `PrepStep` de `shared/types.ts`.
- Produces:
  - `interface ScreenCopy { title: string; subtitle?: string; pill?: { tone: 'ok' | 'wait'; text: string } }`
  - `copyFor(state: AppState): ScreenCopy`
  - `safeName(raw: string): string`
  - `PREP_STEPS: readonly PrepStep[]`, `interface StepRow { label: string; status: 'done' | 'active' | 'pending' }`, `stepRows(current: PrepStep): StepRow[]`, `progress(current: PrepStep): number`

- [ ] **Step 1: Escrever o teste**

Crie `app/src/renderer/src/lib/copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { copyFor, progress, safeName, stepRows } from './copy'

describe('safeName', () => {
  it('mantém nomes normais', () => {
    expect(safeName('Notebook da Sala')).toBe('Notebook da Sala')
  })

  it('HTML vira texto, sem ser interpretado nem apagado', () => {
    expect(safeName('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })

  it('remove caracteres de controle e de direção invertida', () => {
    expect(safeName('No\u0000te\u0007')).toBe('Note')
    expect(safeName('Note\u202Ebook')).toBe('Notebook')
    expect(safeName('A\u200Bb')).toBe('Ab')
  })

  it('limita a 40 caracteres', () => {
    expect(safeName('a'.repeat(100))).toHaveLength(40)
  })

  it('vazio ou só espaços vira um nome genérico', () => {
    expect(safeName('')).toBe('Outro computador')
    expect(safeName('   ')).toBe('Outro computador')
    expect(safeName('\u0000\u202E')).toBe('Outro computador')
  })
})

describe('copyFor', () => {
  it('instalar', () => {
    const copy = copyFor({ screen: 'install' })
    expect(copy.title).toBe('Estenda sua tela,\nsem fio.')
    expect(copy.subtitle).toBe('Sem configurar nada.')
  })

  it('pronto aguarda conexão', () => {
    const copy = copyFor({ screen: 'ready', mode: 'send' })
    expect(copy.title).toBe('Pronto.')
    expect(copy.pill).toEqual({ tone: 'wait', text: 'Aguardando conexão' })
  })

  it('permitir usa o nome seguro do dispositivo', () => {
    const copy = copyFor({ screen: 'approve', mode: 'send', device: 'Notebook' })
    expect(copy.title).toBe('Permitir o Notebook?')
    const hostile = copyFor({ screen: 'approve', mode: 'send', device: '\u202E' })
    expect(hostile.title).toBe('Permitir o Outro computador?')
  })

  it('conectado mostra o selo verde com o nome', () => {
    const copy = copyFor({ screen: 'connected', mode: 'send', device: 'Notebook' })
    expect(copy.title).toBe('Tela estendida.')
    expect(copy.pill).toEqual({ tone: 'ok', text: 'Notebook conectado' })
  })

  it('recebendo mostra o computador de origem', () => {
    const copy = copyFor({ screen: 'receiving', mode: 'receive', host: 'Desktop' })
    expect(copy.title).toBe('Recebendo a tela.')
    expect(copy.pill).toEqual({ tone: 'ok', text: 'Desktop' })
  })

  it('erro mostra a mensagem e o detalhe', () => {
    const copy = copyFor({
      screen: 'error',
      mode: 'send',
      error: { message: 'Não consegui criar o monitor virtual.', detail: 'A permissão foi recusada.' }
    })
    expect(copy.title).toBe('Não consegui criar o monitor virtual.')
    expect(copy.subtitle).toBe('A permissão foi recusada.')
  })

  it('demais telas', () => {
    expect(copyFor({ screen: 'choose' }).title).toBe('Este computador vai…')
    expect(copyFor({ screen: 'preparing', mode: 'send', step: 'engine' }).title).toBe('Preparando.')
    expect(copyFor({ screen: 'discover', mode: 'receive' }).title).toBe('Na sua rede')
  })
})

describe('stepRows e progress', () => {
  it('no primeiro passo só o primeiro está ativo', () => {
    const rows = stepRows('engine')
    expect(rows.map((row) => row.status)).toEqual(['active', 'pending', 'pending', 'pending'])
    expect(rows[0]?.label).toBe('Instalando o motor')
  })

  it('no segundo passo o primeiro já está concluído', () => {
    const rows = stepRows('display')
    expect(rows.map((row) => row.status)).toEqual(['done', 'active', 'pending', 'pending'])
    expect(rows[0]?.label).toBe('Motor instalado')
    expect(rows[1]?.label).toBe('Criando o monitor virtual')
  })

  it('no último passo faltam só o ativo e o Pronto', () => {
    const rows = stepRows('encoder')
    expect(rows.map((row) => row.status)).toEqual(['done', 'done', 'active', 'pending'])
    expect(rows[3]?.label).toBe('Pronto')
  })

  it('progresso em porcentagem', () => {
    expect(progress('engine')).toBe(0)
    expect(progress('display')).toBe(33)
    expect(progress('encoder')).toBe(67)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd app
npx vitest run src/renderer/src/lib/copy.test.ts
```

Expected: FAIL (`./copy` não existe).

- [ ] **Step 3: Implementar**

Crie `app/src/renderer/src/lib/copy.ts`:

```ts
import type { AppState, PrepStep } from '../../../shared/types'

export interface ScreenCopy {
  title: string
  subtitle?: string
  pill?: { tone: 'ok' | 'wait'; text: string }
}

/** Nome vindo da rede: sem controles nem caracteres de direção invertida, no máximo 40 caracteres. */
export function safeName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, 40)
  return cleaned || 'Outro computador'
}

export function copyFor(state: AppState): ScreenCopy {
  switch (state.screen) {
    case 'install':
      return { title: 'Estenda sua tela,\nsem fio.', subtitle: 'Sem configurar nada.' }
    case 'choose':
      return { title: 'Este computador vai…' }
    case 'preparing':
      return { title: 'Preparando.' }
    case 'ready':
      return {
        title: 'Pronto.',
        subtitle: 'Abra o Horizonte no outro computador e escolha este.',
        pill: { tone: 'wait', text: 'Aguardando conexão' }
      }
    case 'approve':
      return {
        title: `Permitir o ${safeName(state.device)}?`,
        subtitle: 'Ele quer usar este computador como segunda tela.'
      }
    case 'connected':
      return { title: 'Tela estendida.', pill: { tone: 'ok', text: `${safeName(state.device)} conectado` } }
    case 'discover':
      return { title: 'Na sua rede' }
    case 'receiving':
      return { title: 'Recebendo a tela.', pill: { tone: 'ok', text: safeName(state.host) } }
    case 'error':
      return { title: state.error.message, subtitle: state.error.detail }
  }
}

export const PREP_STEPS: readonly PrepStep[] = ['engine', 'display', 'encoder']

const LABELS: Record<PrepStep, { done: string; active: string }> = {
  engine: { done: 'Motor instalado', active: 'Instalando o motor' },
  display: { done: 'Monitor virtual criado', active: 'Criando o monitor virtual' },
  encoder: { done: 'Placa de vídeo testada', active: 'Testando a placa de vídeo' }
}

export interface StepRow {
  label: string
  status: 'done' | 'active' | 'pending'
}

export function stepRows(current: PrepStep): StepRow[] {
  const at = PREP_STEPS.indexOf(current)
  const rows = PREP_STEPS.map<StepRow>((step, index) => {
    if (index < at) return { label: LABELS[step].done, status: 'done' }
    if (index === at) return { label: LABELS[step].active, status: 'active' }
    return { label: LABELS[step].active, status: 'pending' }
  })
  return [...rows, { label: 'Pronto', status: 'pending' }]
}

export function progress(current: PrepStep): number {
  return Math.round((PREP_STEPS.indexOf(current) / PREP_STEPS.length) * 100)
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/renderer/src/lib/copy.test.ts
```

Expected: PASS em todos.

- [ ] **Step 5: Provar com mutação**

Em `copy.ts`, remova temporariamente `\u202A-\u202E` do conjunto de caracteres do `replace`. Rode `npx vitest run src/renderer/src/lib/copy.test.ts`.

Expected: FAIL em "remove caracteres de controle e de direção invertida". Desfaça e rode de novo: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add app/src/renderer/src/lib/copy.ts app/src/renderer/src/lib/copy.test.ts
git commit -m "feat: textos das telas e nomes de dispositivo seguros"
```

---

### Task 8: Estilos, base da interface e componentes

**Files:**
- Create: `app/src/renderer/src/lib/store.ts`, `app/src/renderer/src/lib/actions.ts`, `app/src/renderer/src/components/Frame.svelte`, `TopBar.svelte`, `Pill.svelte`, `Stepper.svelte`, `Segmented.svelte`, `Toggle.svelte`
- Modify: `app/src/renderer/index.html`, `app/src/renderer/src/assets/main.css`, `app/src/renderer/src/main.ts`
- Delete: `app/src/renderer/src/components/Versions.svelte` e os recursos de exemplo do template que não forem mais importados

**Interfaces:**
- Consumes: `window.horizonte` (Tarefa 6), `stepBitrate` (Tarefa 3).
- Produces: `snapshot` e `route` (stores), `startSync()`, `send(event)`, `chooseMode(mode)`, `openSettings()`, `closeSettings()`, `patchSettings(patch)`, e os componentes `Frame` (`mode: Mode | null`, `split: boolean`), `TopBar` (`mode: Mode`), `Pill` (`tone`, slot), `Stepper` (`bitrate`, `onChange`), `Segmented`, `Toggle`.

- [ ] **Step 1: Trocar o HTML**

Substitua `app/src/renderer/index.html` por:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Horizonte</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Escrever os estilos**

Substitua todo o conteúdo de `app/src/renderer/src/assets/main.css` por:

```css
:root {
  --bg: #fbfbfd;
  --fg: #1d1d1f;
  --muted: #6e6e73;
  --faint: #86868b;
  --line: #d2d2d7;
  --line-soft: #e5e5ea;
  --card: #ffffff;
  --seg: #ededf0;
  --seg-on: #ffffff;
  --seg-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.06);
  --ok-bg: #e7f6ec;
  --ok-fg: #1b7f3b;
  --ok-dot: #30b454;
  --wait-bg: #f0f0f3;
  --wait-fg: #6e6e73;
  --wait-dot: #ff9f0a;
  --accent: #0a62d0;
  --switch-on: #34c759;
  --danger-bg: #fdebea;
  --danger-fg: #c4160b;
  --tile-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.05);
  --font: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101012;
    --fg: #f5f5f7;
    --muted: #9a9aa2;
    --faint: #8a8a92;
    --line: #3a3a40;
    --line-soft: #2c2c31;
    --card: #1b1b1f;
    --seg: #26262a;
    --seg-on: #48484f;
    --seg-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    --ok-bg: rgba(48, 209, 88, 0.14);
    --ok-fg: #6fe08f;
    --ok-dot: #30d158;
    --wait-bg: #26262a;
    --wait-fg: #9a9aa2;
    --accent: #4da3ff;
    --switch-on: #30d158;
    --danger-bg: rgba(255, 69, 58, 0.18);
    --danger-fg: #ff8a82;
    --tile-shadow: none;
    --card-shadow: none;
  }
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: inherit;
  cursor: pointer;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Telas */
.screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 24px 40px;
  text-align: center;
}

.center {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.center-split {
  justify-content: space-between;
  padding-top: 22px;
}

.stack {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gap-xs { gap: 6px; }
.gap-sm { gap: 12px; }
.gap-md { gap: 26px; }
.gap-lg { gap: 34px; }

.title {
  margin: 0;
  font-size: 52px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.05;
  white-space: pre-line;
  max-width: 560px;
}

.title-lg { font-size: 46px; line-height: 1.08; }
.title-md { font-size: 38px; line-height: 1.12; letter-spacing: -0.03em; }

.subtitle {
  margin: 0;
  font-size: 19px;
  color: var(--muted);
  line-height: 1.4;
  max-width: 420px;
}

.hint { font-size: 13px; color: var(--muted); }
.hint-faint { font-size: 13px; color: var(--faint); }
.hint strong { color: var(--fg); font-weight: 600; }

/* Barra do topo */
.topbar {
  width: 100%;
  height: 56px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}

.topbar-right { justify-self: end; }

.seg {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--seg);
  border-radius: 12px;
}

.seg-item {
  height: 38px;
  padding: 0 22px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
}

.seg-item.on {
  background: var(--seg-on);
  color: var(--fg);
  font-weight: 600;
  box-shadow: var(--seg-shadow);
}

.seg-wide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.icon-btn {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 22px;
  background: transparent;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Botões */
.btn {
  height: 48px;
  padding: 0 44px;
  border-radius: 24px;
  border: 1px solid transparent;
  font-size: 16px;
  font-weight: 600;
}

.btn-primary { background: var(--fg); color: var(--bg); }
.btn-outline { background: var(--card); color: var(--fg); border-color: var(--line); }
.btn-ghost {
  height: 44px;
  padding: 0 20px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 15px;
  font-weight: 400;
}
.btn-sm { height: 44px; padding: 0 28px; border-radius: 22px; font-size: 15px; }

.link {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 14px;
  font-weight: 500;
}

/* Selo de estado */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.pill-ok { color: var(--ok-fg); background: var(--ok-bg); }
.pill-wait { color: var(--wait-fg); background: var(--wait-bg); }
.dot { width: 8px; height: 8px; border-radius: 4px; }
.pill-ok .dot { background: var(--ok-dot); }
.pill-wait .dot { background: var(--wait-dot); }

/* Instalar e escolher */
.mark {
  width: 76px;
  height: 76px;
  border-radius: 22px;
  background: var(--fg);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wordmark { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }

.choices {
  width: 100%;
  max-width: 640px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.choice {
  min-height: 176px;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid var(--line-soft);
  background: var(--card);
  color: var(--fg);
  box-shadow: var(--card-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.choice-name { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.choice-sub { font-size: 14px; color: var(--muted); line-height: 1.4; }

/* Preparando */
.bar { width: 280px; height: 4px; border-radius: 2px; background: var(--line-soft); }
.bar-fill { height: 100%; border-radius: 2px; background: var(--fg); transition: width 0.3s ease; }

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
  font-size: 17px;
}

.step { display: flex; align-items: center; gap: 12px; }
.step-pending { color: var(--faint); }
.step svg { flex: none; }

/* Permitir e erro */
.badge {
  width: 72px;
  height: 72px;
  border-radius: 36px;
  background: var(--wait-bg);
  color: var(--fg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-danger { background: var(--danger-bg); color: var(--danger-fg); width: 64px; height: 64px; border-radius: 32px; }

/* Estender / Em uso */
.stepper { display: flex; align-items: center; gap: 22px; }
.stepper-value { display: flex; flex-direction: column; gap: 2px; min-width: 150px; }
.stepper-num { font-size: 32px; font-weight: 600; letter-spacing: -0.02em; }
.stepper-cap { font-size: 13px; color: var(--muted); }

.round {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--fg);
  font-size: 22px;
  line-height: 1;
}

/* Lista de computadores */
.hosts { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 24px; }

.host {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 14px 14px 18px;
  border-radius: 20px;
  background: var(--card);
  border: 1px solid var(--line-soft);
  box-shadow: var(--card-shadow);
  text-align: left;
}

.host-icon {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 12px;
  background: var(--wait-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.host-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.host-name { font-size: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.host-addr { font-size: 14px; color: var(--muted); }
.searching { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); }

/* Ajustes */
.sheet { min-height: 100vh; display: flex; flex-direction: column; }

.sheet-head {
  height: 64px;
  flex: none;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 20px;
}

.sheet-title { margin: 0; font-size: 17px; font-weight: 600; }

.back {
  height: 44px;
  padding: 0 10px 0 4px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 16px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  justify-self: start;
}

.sheet-body {
  width: 100%;
  max-width: 500px;
  align-self: center;
  padding: 8px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.group { display: flex; flex-direction: column; gap: 12px; }
.group-label { margin: 0 4px; font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: 0.02em; }

.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

.tile {
  height: 84px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--fg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.tile.on { border: 2px solid var(--fg); box-shadow: var(--tile-shadow); }
.tile-name { font-size: 16px; font-weight: 600; }
.tile-sub { font-size: 13px; color: var(--muted); }

.card { background: var(--card); border: 1px solid var(--line-soft); border-radius: 16px; }
.card-pad { padding: 14px 18px 12px; display: flex; flex-direction: column; gap: 6px; }

.row {
  min-height: 56px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
}

.row + .row { border-top: 1px solid var(--line-soft); }
.row-value { color: var(--muted); }

.range-row { display: flex; align-items: baseline; justify-content: space-between; font-size: 15px; }
.range-row strong { font-weight: 600; }
input[type='range'] { width: 100%; height: 28px; margin: 0; accent-color: var(--fg); }

.text-input {
  width: 180px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  color: var(--fg);
  font-size: 15px;
  text-align: right;
}

.disclosure {
  height: 56px;
  padding: 0 18px;
  border-radius: 16px;
  border: 1px solid var(--line-soft);
  background: var(--card);
  color: var(--fg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
}

.adv-block { padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.adv-block + .adv-block { border-top: 1px solid var(--line-soft); }
.adv-label { font-size: 15px; }
.adv-note { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.4; }

.switch {
  width: 51px;
  height: 31px;
  padding: 2px;
  border: 0;
  border-radius: 16px;
  background: var(--line);
  display: flex;
  justify-content: flex-start;
}

.switch.on { background: var(--switch-on); justify-content: flex-end; }
.switch-thumb { width: 27px; height: 27px; border-radius: 14px; background: #ffffff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25); }

.sheet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--faint);
}

.sheet-foot button { height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 13px; }
```

- [ ] **Step 3: Escrever a ponte de estado e as ações**

Crie `app/src/renderer/src/lib/store.ts`:

```ts
import { writable } from 'svelte/store'
import type { Snapshot } from '../../../shared/types'

export const snapshot = writable<Snapshot | null>(null)
export const route = writable<'main' | 'settings'>('main')

/** Busca o estado atual e passa a acompanhar as mudanças. Devolve a função que cancela. */
export async function startSync(): Promise<() => void> {
  const stop = window.horizonte.onSnapshot((next) => snapshot.set(next))
  snapshot.set(await window.horizonte.getSnapshot())
  return stop
}
```

Crie `app/src/renderer/src/lib/actions.ts`:

```ts
import type { AppEvent, Mode, SettingsPatch } from '../../../shared/types'
import { route } from './store'

export const send = (event: AppEvent): Promise<void> => window.horizonte.dispatch(event)
export const chooseMode = (mode: Mode): Promise<void> => send({ type: 'CHOOSE', mode })
export const patchSettings = (patch: SettingsPatch): Promise<unknown> => window.horizonte.updateSettings(patch)
export const openSettings = (): void => route.set('settings')
export const closeSettings = (): void => route.set('main')
```

- [ ] **Step 4: Escrever os componentes**

Crie `app/src/renderer/src/components/TopBar.svelte`:

```svelte
<script lang="ts">
  import type { Mode } from '../../../shared/types'
  import { chooseMode, openSettings } from '../lib/actions'

  export let mode: Mode
</script>

<header class="topbar">
  <span></span>
  <div class="seg" role="group" aria-label="Modo">
    <button class="seg-item" class:on={mode === 'send'} aria-pressed={mode === 'send'} on:click={() => chooseMode('send')}>
      Enviar
    </button>
    <button class="seg-item" class:on={mode === 'receive'} aria-pressed={mode === 'receive'} on:click={() => chooseMode('receive')}>
      Mostrar
    </button>
  </div>
  <div class="topbar-right">
    <button class="icon-btn" aria-label="Ajustes" on:click={openSettings}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />
      </svg>
    </button>
  </div>
</header>
```

Crie `app/src/renderer/src/components/Frame.svelte`:

```svelte
<script lang="ts">
  import type { Mode } from '../../../shared/types'
  import TopBar from './TopBar.svelte'

  export let mode: Mode | null = null
  export let split = false
</script>

<div class="screen">
  {#if mode}<TopBar {mode} />{/if}
  <main class="center" class:center-split={split}>
    <slot />
  </main>
</div>
```

Crie `app/src/renderer/src/components/Pill.svelte`:

```svelte
<script lang="ts">
  export let tone: 'ok' | 'wait'
</script>

<span class="pill pill-{tone}"><span class="dot"></span><slot /></span>
```

Crie `app/src/renderer/src/components/Stepper.svelte`:

```svelte
<script lang="ts">
  import { stepBitrate } from '../../../shared/quality'

  export let bitrate: number
  export let onChange: (mbps: number) => void
</script>

<div class="stepper">
  <button class="round" aria-label="Diminuir qualidade" on:click={() => onChange(stepBitrate(bitrate, -1))}>−</button>
  <div class="stepper-value">
    <span class="stepper-num">{bitrate} Mbps</span>
    <span class="stepper-cap">Qualidade</span>
  </div>
  <button class="round" aria-label="Aumentar qualidade" on:click={() => onChange(stepBitrate(bitrate, 1))}>+</button>
</div>
```

Crie `app/src/renderer/src/components/Segmented.svelte`:

```svelte
<script lang="ts">
  export let label: string
  export let options: { value: string | number; text: string }[]
  export let value: string | number
  export let onSelect: (value: string | number) => void
</script>

<div class="seg seg-wide" role="group" aria-label={label}>
  {#each options as option}
    <button class="seg-item" class:on={option.value === value} aria-pressed={option.value === value} on:click={() => onSelect(option.value)}>
      {option.text}
    </button>
  {/each}
</div>
```

Crie `app/src/renderer/src/components/Toggle.svelte`:

```svelte
<script lang="ts">
  export let label: string
  export let checked: boolean
  export let onChange: (checked: boolean) => void
</script>

<button class="switch" class:on={checked} role="switch" aria-checked={checked} aria-label={label} on:click={() => onChange(!checked)}>
  <span class="switch-thumb"></span>
</button>
```

- [ ] **Step 5: Ajustar o ponto de entrada e limpar o template**

Substitua `app/src/renderer/src/main.ts` por (para Svelte 5, que é o caso se a Tarefa 1 registrou `svelte@5`):

```ts
import './assets/main.css'
import { mount } from 'svelte'
import App from './App.svelte'

mount(App, { target: document.getElementById('app') as HTMLElement })
```

Se a Tarefa 1 registrou `svelte@4`, use este no lugar:

```ts
import './assets/main.css'
import App from './App.svelte'

new App({ target: document.getElementById('app') as HTMLElement })
```

Apague os arquivos de exemplo do template que ficaram sem uso: `app/src/renderer/src/components/Versions.svelte`, `app/src/renderer/src/assets/base.css`, `app/src/renderer/src/assets/electron.svg` e `app/src/renderer/src/assets/wavy-lines.svg` (se existirem). A verificação de tipos da Tarefa 9 acusará qualquer importação que tenha sobrado.

- [ ] **Step 6: Commit**

(Ainda não há `App.svelte` novo: a compilação fecha na Tarefa 9, então este commit é de checkpoint.)

```powershell
cd ..
git add app/src/renderer
git commit -m "feat: estilos, ponte de estado e componentes base da interface"
```

---

### Task 9: Telas e App

**Files:**
- Create: `app/src/renderer/src/screens/Install.svelte`, `Choose.svelte`, `Preparing.svelte`, `Ready.svelte`, `Approve.svelte`, `Connected.svelte`, `Discover.svelte`, `Receiving.svelte`, `ErrorScreen.svelte`
- Modify: `app/src/renderer/src/App.svelte`

**Interfaces:**
- Consumes: componentes e ações da Tarefa 8, `copyFor`, `stepRows`, `progress`, `safeName` da Tarefa 7.
- Produces: o `App` que escolhe a tela pelo estado do snapshot e a página de Ajustes pela rota.

- [ ] **Step 1: Instalar e escolher**

Crie `app/src/renderer/src/screens/Install.svelte`:

```svelte
<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'

  const copy = copyFor({ screen: 'install' })
</script>

<div class="stack gap-sm">
  <div class="mark" aria-hidden="true">
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="8" width="26" height="18" rx="3.5" /><rect x="18" y="20" width="26" height="18" rx="3.5" />
    </svg>
  </div>
  <span class="wordmark">Horizonte</span>
</div>
<div class="stack gap-sm">
  <h1 class="title title-lg">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<div class="stack gap-sm">
  <button class="btn btn-primary" on:click={() => send({ type: 'INSTALL_DONE' })}>Instalar</button>
  <span class="hint">Pede permissão de administrador uma vez.</span>
</div>
```

Crie `app/src/renderer/src/screens/Choose.svelte`:

```svelte
<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { chooseMode } from '../lib/actions'

  const copy = copyFor({ screen: 'choose' })
</script>

<h1 class="title title-md">{copy.title}</h1>
<div class="choices">
  <button class="choice" on:click={() => chooseMode('send')}>
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="4" y="8" width="30" height="22" rx="4" /><path d="M14 38h10M19 30v8" /><path d="M30 20h14M38 14l6 6-6 6" />
    </svg>
    <span class="stack gap-xs">
      <span class="choice-name">Enviar a tela</span>
      <span class="choice-sub">É o computador principal.</span>
    </span>
  </button>
  <button class="choice" on:click={() => chooseMode('receive')}>
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="14" y="8" width="30" height="22" rx="4" /><path d="M24 38h10M29 30v8" /><path d="M18 20H4M10 14l-6 6 6 6" />
    </svg>
    <span class="stack gap-xs">
      <span class="choice-name">Mostrar a tela</span>
      <span class="choice-sub">É o computador que recebe.</span>
    </span>
  </button>
</div>
<span class="hint">Você troca com um clique, a qualquer momento.</span>
```

- [ ] **Step 2: Preparando, pronto e permitir**

Crie `app/src/renderer/src/screens/Preparing.svelte`:

```svelte
<script lang="ts">
  import type { PrepStep } from '../../../shared/types'
  import { copyFor, progress, stepRows } from '../lib/copy'

  export let step: PrepStep

  $: copy = copyFor({ screen: 'preparing', mode: 'send', step })
  $: rows = stepRows(step)
  $: percent = progress(step)
</script>

<h1 class="title">{copy.title}</h1>
<div class="bar" role="progressbar" aria-label="Progresso" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
  <div class="bar-fill" style="width: {percent}%"></div>
</div>
<ul class="steps">
  {#each rows as row}
    <li class="step step-{row.status}">
      {#if row.status === 'done'}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ok-fg)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" />
        </svg>
      {:else if row.status === 'active'}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="var(--line)" /><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--fg)" />
        </svg>
      {:else}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--line)" stroke-width="2.4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
        </svg>
      {/if}
      {row.label}
    </li>
  {/each}
</ul>
```

Crie `app/src/renderer/src/screens/Ready.svelte`:

```svelte
<script lang="ts">
  import { copyFor } from '../lib/copy'
  import Pill from '../components/Pill.svelte'

  export let deviceName: string

  const copy = copyFor({ screen: 'ready', mode: 'send' })
</script>

{#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
<h1 class="title">{copy.title}</h1>
<p class="subtitle">{copy.subtitle}</p>
<span class="hint">Nome deste computador: <strong>{deviceName}</strong></span>
```

Crie `app/src/renderer/src/screens/Approve.svelte`:

```svelte
<script lang="ts">
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  export let device: string

  $: copy = copyFor({ screen: 'approve', mode: 'send', device })
</script>

<div class="badge" aria-hidden="true">
  <svg width="36" height="36" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="10" width="30" height="21" rx="3.5" /><path d="M4 37h40" />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title title-md">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<div class="stack gap-xs">
  <button class="btn btn-primary" on:click={() => send({ type: 'APPROVE' })}>Permitir</button>
  <button class="btn btn-ghost" on:click={() => send({ type: 'DENY' })}>Recusar</button>
</div>
<span class="hint-faint">{safeName(device)} · mesma rede</span>
```

- [ ] **Step 3: Em uso (enviar e receber)**

Crie `app/src/renderer/src/screens/Connected.svelte`:

```svelte
<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { patchSettings, send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'
  import Stepper from '../components/Stepper.svelte'

  export let device: string
  export let bitrate: number

  $: copy = copyFor({ screen: 'connected', mode: 'send', device })
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
<div class="stack gap-md">
  <Stepper {bitrate} onChange={(mbps) => patchSettings({ bitrate: mbps })} />
  <button class="btn btn-outline" on:click={() => send({ type: 'STOP' })}>Parar</button>
</div>
```

Crie `app/src/renderer/src/screens/Receiving.svelte`:

```svelte
<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { patchSettings, send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'
  import Stepper from '../components/Stepper.svelte'

  export let host: string
  export let bitrate: number

  $: copy = copyFor({ screen: 'receiving', mode: 'receive', host })
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
<div class="stack gap-md">
  <Stepper {bitrate} onChange={(mbps) => patchSettings({ bitrate: mbps })} />
  <button class="btn btn-outline" on:click={() => send({ type: 'STOP' })}>Sair</button>
</div>
```

- [ ] **Step 4: Descobrir computadores e erro**

Crie `app/src/renderer/src/screens/Discover.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import type { Host } from '../../../shared/types'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  const copy = copyFor({ screen: 'discover', mode: 'receive' })
  let hosts: Host[] = []
  let searching = true

  onMount(() => {
    let alive = true
    window.horizonte
      .listHosts()
      .then((found) => {
        if (alive) hosts = found
      })
      .finally(() => {
        if (alive) searching = false
      })
    return () => {
      alive = false
    }
  })
</script>

<div class="hosts">
  <h1 class="title title-md">{copy.title}</h1>
  {#each hosts as host (host.address)}
    <div class="host">
      <div class="host-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="8" width="36" height="24" rx="4" /><path d="M16 40h16M24 32v8" />
        </svg>
      </div>
      <div class="host-body">
        <span class="host-name">{safeName(host.name)}</span>
        <span class="host-addr">{host.address} · pronto</span>
      </div>
      <button class="btn btn-primary btn-sm" on:click={() => send({ type: 'CONNECT', host: safeName(host.name) })}>Estender</button>
    </div>
  {/each}
  <div class="stack gap-xs">
    {#if searching}
      <span class="searching">Procurando outros computadores…</span>
    {/if}
    <button class="link">Não aparece? Adicionar pelo IP</button>
  </div>
</div>
```

Crie `app/src/renderer/src/screens/ErrorScreen.svelte`:

```svelte
<script lang="ts">
  import type { AppError } from '../../../shared/types'
  import { send } from '../lib/actions'

  export let error: AppError

  async function copyDiagnostic(): Promise<void> {
    await navigator.clipboard.writeText([error.message, error.detail ?? ''].join('\n').trim())
  }
</script>

<div class="badge badge-danger" aria-hidden="true">
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8v5M12 16.5v.01" /><path d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title title-md">{error.message}</h1>
  {#if error.detail}<p class="subtitle">{error.detail}</p>{/if}
</div>
<div class="stack gap-xs">
  <button class="btn btn-primary" on:click={() => send({ type: 'RETRY' })}>Tentar de novo</button>
  <button class="btn btn-ghost" on:click={copyDiagnostic}>Copiar diagnóstico</button>
</div>
```

- [ ] **Step 5: Montar o App**

Substitua `app/src/renderer/src/App.svelte` por (a página de Ajustes entra na Tarefa 10; por enquanto a rota `settings` mostra a tela principal):

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { snapshot, startSync } from './lib/store'
  import Frame from './components/Frame.svelte'
  import Install from './screens/Install.svelte'
  import Choose from './screens/Choose.svelte'
  import Preparing from './screens/Preparing.svelte'
  import Ready from './screens/Ready.svelte'
  import Approve from './screens/Approve.svelte'
  import Connected from './screens/Connected.svelte'
  import Discover from './screens/Discover.svelte'
  import Receiving from './screens/Receiving.svelte'
  import ErrorScreen from './screens/ErrorScreen.svelte'

  onMount(() => {
    let stop: (() => void) | undefined
    let disposed = false
    void startSync().then((unsubscribe) => {
      if (disposed) unsubscribe()
      else stop = unsubscribe
    })
    return () => {
      disposed = true
      stop?.()
    }
  })
</script>

{#if $snapshot}
  {@const state = $snapshot.state}
  {@const settings = $snapshot.settings}
  {#if state.screen === 'install'}
    <Frame><Install /></Frame>
  {:else if state.screen === 'choose'}
    <Frame><Choose /></Frame>
  {:else if state.screen === 'preparing'}
    <Frame mode="send"><Preparing step={state.step} /></Frame>
  {:else if state.screen === 'ready'}
    <Frame mode="send"><Ready deviceName={settings.deviceName} /></Frame>
  {:else if state.screen === 'approve'}
    <Frame><Approve device={state.device} /></Frame>
  {:else if state.screen === 'connected'}
    <Frame mode="send" split><Connected device={state.device} bitrate={settings.bitrate} /></Frame>
  {:else if state.screen === 'discover'}
    <Frame mode="receive"><Discover /></Frame>
  {:else if state.screen === 'receiving'}
    <Frame mode="receive" split><Receiving host={state.host} bitrate={settings.bitrate} /></Frame>
  {:else if state.screen === 'error'}
    <Frame mode={state.mode}><ErrorScreen error={state.error} /></Frame>
  {/if}
{/if}
```

- [ ] **Step 6: Verificar tipos e compilação**

```powershell
cd app
npm run typecheck
npm run build
```

Expected: sem erros. Se o `svelte-check` reclamar do uso de `{@const}` dentro do `{#if}`, mova `state` e `settings` para variáveis reativas no `<script>` (`$: state = $snapshot?.state`) e ajuste os `{#if}` para `{#if $snapshot && state}`.

- [ ] **Step 7: Verificar no app**

```powershell
npm run dev
```

Expected: a janela abre na tela "Estenda sua tela, sem fio.". Clique em **Instalar**, depois em **Enviar a tela**. Deve passar pelo "Preparando." com a barra e as etapas, chegar em "Pronto." e, após cerca de 3 segundos, mostrar "Permitir o Notebook?". Clique em **Permitir**: em cerca de 1,5 s aparece "Tela estendida." com o selo verde. Clique no − e no + (o valor muda entre 30, 20 e 40 Mbps), clique em **Parar** e volte a "Pronto.". Clique em **Mostrar** na barra do topo: deve ir a "Na sua rede" com o "Desktop"; **Estender** leva a "Recebendo a tela.". Feche o app.

- [ ] **Step 8: Commit**

```powershell
cd ..
git add app/src/renderer
git commit -m "feat: as nove telas do fluxo e o App que escolhe pelo estado"
```

---

### Task 10: Página de Ajustes

**Files:**
- Create: `app/src/renderer/src/screens/SettingsPage.svelte`
- Modify: `app/src/renderer/src/App.svelte`

**Interfaces:**
- Consumes: `Settings`, `PROFILES`, `patchSettings`, `closeSettings`, `Segmented`, `Toggle`, rota `route`.
- Produces: tela de Ajustes com perfis, slider, interruptor, nome e Avançado.

- [ ] **Step 1: Escrever a página**

Crie `app/src/renderer/src/screens/SettingsPage.svelte`:

```svelte
<script lang="ts">
  import { PROFILES } from '../../../shared/quality'
  import type { Codec, Encoding, Fps, Resolution, Settings } from '../../../shared/types'
  import { closeSettings, patchSettings } from '../lib/actions'
  import Segmented from '../components/Segmented.svelte'
  import Toggle from '../components/Toggle.svelte'

  export let settings: Settings

  let advanced = false
  let draft = settings.bitrate
  $: draft = settings.bitrate

  const tiles = [
    { id: 'economico', name: 'Econômico', mbps: PROFILES.economico },
    { id: 'equilibrado', name: 'Equilibrado', mbps: PROFILES.equilibrado },
    { id: 'maximo', name: 'Máximo', mbps: PROFILES.maximo }
  ] as const

  async function copyDiagnostic(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(settings, null, 2))
  }
</script>

<div class="sheet">
  <header class="sheet-head">
    <button class="back" on:click={closeSettings}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      Voltar
    </button>
    <h1 class="sheet-title">Ajustes</h1>
    <span></span>
  </header>

  <div class="sheet-body">
    <section class="group" aria-labelledby="g-quality">
      <h2 class="group-label" id="g-quality">Qualidade</h2>
      <div class="tiles">
        {#each tiles as tile}
          <button class="tile" class:on={settings.profile === tile.id} aria-pressed={settings.profile === tile.id} on:click={() => patchSettings({ bitrate: tile.mbps })}>
            <span class="tile-name">{tile.name}</span>
            <span class="tile-sub">{tile.mbps} Mbps</span>
          </button>
        {/each}
      </div>
      <div class="card card-pad">
        <div class="range-row"><label for="bitrate">Personalizado</label><strong>{draft} Mbps</strong></div>
        <input
          id="bitrate"
          type="range"
          min="5"
          max="80"
          bind:value={draft}
          on:change={() => patchSettings({ bitrate: Number(draft) })}
        />
      </div>
      <p class="adv-note">Em Wi-Fi 5 GHz, de 30 a 50 Mbps costuma ficar nítido. Mais que isso pode travar.</p>
    </section>

    <section class="group" aria-labelledby="g-computer">
      <h2 class="group-label" id="g-computer">Este computador</h2>
      <div class="card">
        <div class="row">
          <span>Abrir com o sistema</span>
          <Toggle label="Abrir com o sistema" checked={settings.autostart} onChange={(checked) => patchSettings({ autostart: checked })} />
        </div>
        <div class="row">
          <label for="device-name">Nome</label>
          <input
            id="device-name"
            class="text-input"
            maxlength="40"
            value={settings.deviceName}
            on:change={(event) => patchSettings({ deviceName: event.currentTarget.value })}
          />
        </div>
      </div>
    </section>

    <section class="group">
      <button class="disclosure" aria-expanded={advanced} on:click={() => (advanced = !advanced)}>
        <span>Avançado</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d={advanced ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {#if advanced}
        <div class="card">
          <div class="adv-block">
            <span class="adv-label">Resolução</span>
            <Segmented
              label="Resolução"
              value={settings.resolution}
              options={[{ value: '720p', text: '720p' }, { value: '1080p', text: '1080p' }, { value: '1440p', text: '1440p' }]}
              onSelect={(value) => patchSettings({ resolution: value as Resolution })}
            />
          </div>
          <div class="adv-block">
            <span class="adv-label">Quadros por segundo</span>
            <Segmented
              label="Quadros por segundo"
              value={settings.fps}
              options={[{ value: 30, text: '30' }, { value: 60, text: '60' }, { value: 120, text: '120' }]}
              onSelect={(value) => patchSettings({ fps: value as Fps })}
            />
          </div>
          <div class="adv-block">
            <span class="adv-label">Codificação</span>
            <Segmented
              label="Codificação"
              value={settings.encoding}
              options={[{ value: 'auto', text: 'Automática' }, { value: 'gpu', text: 'Placa de vídeo' }, { value: 'cpu', text: 'Processador' }]}
              onSelect={(value) => patchSettings({ encoding: value as Encoding })}
            />
            <p class="adv-note">Automática usa a placa de vídeo e cai para o processador se ela falhar.</p>
          </div>
          <div class="adv-block">
            <span class="adv-label">Codec</span>
            <Segmented
              label="Codec"
              value={settings.codec}
              options={[{ value: 'h264', text: 'H.264' }, { value: 'hevc', text: 'HEVC' }, { value: 'av1', text: 'AV1' }]}
              onSelect={(value) => patchSettings({ codec: value as Codec })}
            />
          </div>
        </div>
      {/if}
    </section>

    <div class="sheet-foot">
      <span>Horizonte 0.1.0</span>
      <button on:click={copyDiagnostic}>Copiar diagnóstico</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Ligar a rota no App**

Em `app/src/renderer/src/App.svelte`: adicione `route` à importação de `./lib/store` (`import { route, snapshot, startSync } from './lib/store'`), adicione `import SettingsPage from './screens/SettingsPage.svelte'` e troque a primeira condição do bloco principal. Onde está:

```svelte
  {#if state.screen === 'install'}
    <Frame><Install /></Frame>
```

passe a ser:

```svelte
  {#if $route === 'settings'}
    <SettingsPage {settings} />
  {:else if state.screen === 'install'}
    <Frame><Install /></Frame>
```

- [ ] **Step 3: Verificar tipos, compilação e testes**

```powershell
cd app
npm run typecheck
npm run build
npm test
```

Expected: tudo sem erros; `npm test` mostra todos os arquivos de teste passando.

- [ ] **Step 4: Verificar no app**

```powershell
npm run dev
```

Expected: chegue até "Pronto." (Instalar, Enviar a tela) e clique no ícone de ajustes. Deve abrir "Ajustes" com os três perfis (Equilibrado marcado). Clique em **Máximo**: o marcador troca e o slider mostra 60 Mbps. Arraste o slider para 45: o valor aparece como "Personalizado" (nenhum perfil marcado). **Avançado** abre os quatro seletores segmentados; **Voltar** retorna à tela anterior. Feche o app, abra de novo com `npm run dev`: os ajustes devem ter sido lembrados (bitrate 45).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add app/src/renderer
git commit -m "feat: pagina de ajustes com perfis, slider e opcoes avancadas"
```

---

### Task 11: Verificação final e envio

**Files:**
- Modify: nenhum além de correções que a verificação revelar.

- [ ] **Step 1: Rodar a verificação completa**

```powershell
cd app
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: `lint` sem erros (corrija formatação com `npm run format` se necessário), `typecheck` e `build` sem erros, `npm test` com todos os testes passando. Registre quantos testes passaram.

- [ ] **Step 2: Conferir as telas contra o protótipo**

Rode `npm run dev` e percorra as 10 telas, comparando com https://claude.ai/artifact/UDyGX3BvagvETCiey4eYSX. Use o tema escuro do Windows (Configurações, Personalização, Cores) para ver o modo escuro. Anote qualquer diferença visual para um commit de ajuste, sem mudar o desenho aprovado.

- [ ] **Step 3: Garantir que o motor de mentira nunca vai a produção por engano**

Confirme que `app/src/main/index.ts` só chama `runDevDemo` com `!app.isPackaged`, e que `README` ou o plano 2 trocará o `FakeEngine`. Rode:

```powershell
cd ..
git grep -n "FakeEngine" -- app/src/main/index.ts
```

Expected: uma linha de importação e uma de uso, sem outras referências no processo principal.

- [ ] **Step 4: Enviar**

```powershell
git status --short
git push
```

Expected: árvore limpa e push concluído para `origin/main`.
