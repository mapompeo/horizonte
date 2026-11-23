<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import type { AppState, Mode } from '../../shared/types'
  import { route, snapshot, startSync, syncError } from './lib/store'
  import ErrorCode from './components/ErrorCode.svelte'
  import { L } from './lib/i18n'
  import { errorFix } from '../../shared/errors'
  import { ms } from './lib/motion'
  import TopBar from './components/TopBar.svelte'
  import UpdateControls from './components/UpdateControls.svelte'
  import SendHome from './screens/SendHome.svelte'
  import Approve from './screens/Approve.svelte'
  import Discover from './screens/Discover.svelte'
  import Receiving from './screens/Receiving.svelte'
  import Mouse from './screens/Mouse.svelte'
  import MouseRequest from './screens/MouseRequest.svelte'
  import MouseActive from './screens/MouseActive.svelte'
  import ErrorScreen from './screens/ErrorScreen.svelte'
  import SettingsPage from './screens/SettingsPage.svelte'

  /** Em quais telas o seletor Enviar/Receber aparece (e qual lado está ativo). */
  function modeOf(state: AppState): Mode | null {
    switch (state.screen) {
      case 'preparing':
      case 'ready':
      case 'connected':
        return 'send'
      case 'discover':
      case 'receiving':
        return 'receive'
      case 'mouse':
      case 'mouse-request':
      case 'mouse-active':
        return 'mouse'
      case 'error':
        return state.mode
      default:
        return null
    }
  }

  /** Preparando, pronto e conectado são a mesma tela (o QR fica no lugar): só o resto troca com animação. */
  function viewKey(state: AppState): string {
    return state.screen === 'preparing' || state.screen === 'ready' || state.screen === 'connected'
      ? 'home'
      : state.screen
  }

  /** A tela que sai fica por cima, sem empurrar a que entra. */
  function leave(node: HTMLElement): { duration: number; css: (t: number) => string } {
    node.style.position = 'absolute'
    node.style.inset = '64px 24px 40px'
    node.style.width = 'auto'
    node.style.pointerEvents = 'none'
    return { duration: ms(120), css: (t) => `opacity: ${t}` }
  }

  /** A tela que começou a sair e voltou (a saída foi revertida): de novo no lugar e clicável. */
  function back(node: HTMLElement): void {
    node.style.removeProperty('position')
    node.style.removeProperty('inset')
    node.style.removeProperty('width')
    node.style.removeProperty('pointer-events')
  }

  let syncing = $state(false)
  let stop: (() => void) | undefined
  let disposed = false

  async function initialize(): Promise<void> {
    if (syncing || disposed) return
    syncing = true
    try {
      const unsubscribe = await startSync()
      if (disposed) unsubscribe()
      else stop = unsubscribe
    } catch {
      // startSync publica o erro de inicialização sem fabricar estado do motor.
    } finally {
      syncing = false
    }
  }

  /** Depois de trocar de tela, o foco vai para o título: leitor de tela anuncia onde a pessoa está. */
  const view = $derived($snapshot ? viewKey($snapshot.state) : null)
  $effect(() => {
    void [view, $route]
    void tick().then(() => {
      const title = document.querySelector<HTMLElement>('main h1, .sheet-title')
      if (!title) return
      title.tabIndex = -1
      title.focus({ preventScroll: true })
    })
  })

  let scrolled = $state(false)
  $effect(() => {
    document.documentElement.toggleAttribute('data-scrolled', scrolled)
  })

  onMount(() => {
    void initialize()
    return () => {
      disposed = true
      stop?.()
    }
  })
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 0)} />
<div class="drag-strip" aria-hidden="true"></div>
{#if $snapshot}
  {@const state = $snapshot.state}
  {@const settings = $snapshot.settings}
  {#if $route === 'settings' && state.screen !== 'error' && state.screen !== 'approve'}
    <SettingsPage
      {settings}
      devices={state.screen === 'connected' ? state.devices : []}
      links={$snapshot.links}
      mode={modeOf(state)}
    />
  {:else}
    {@const mode = modeOf(state)}
    <div class="screen">
      {#if mode}<TopBar
          {mode}
          live={state.screen === 'connected' || state.screen === 'receiving'}
        />{/if}
      {#key viewKey(state)}
        <main
          class="center"
          in:fly={{ y: 12, duration: ms(340), delay: ms(60), easing: cubicOut }}
          out:leave
          onintrostart={(event) => back(event.currentTarget)}
        >
          {#if state.screen === 'preparing' || state.screen === 'ready'}
            <SendHome
              devices={[]}
              placement={settings.screenPlacement}
              placements={settings.screenPlacements}
              preparing={state.screen === 'preparing'}
              progress={state.screen === 'preparing' ? state.progress : undefined}
            />
          {:else if state.screen === 'approve'}
            <Approve
              device={state.device}
              pin={state.pin}
              address={state.address}
              fingerprint={state.fingerprint}
            />
          {:else if state.screen === 'connected'}
            <SendHome
              devices={state.devices}
              placement={settings.screenPlacement}
              placements={settings.screenPlacements}
              links={$snapshot.links}
            />
          {:else if state.screen === 'discover'}
            <Discover lastHost={settings.lastHost} />
          {:else if state.screen === 'receiving'}
            <Receiving host={state.host} name={state.name} />
          {:else if state.screen === 'mouse'}
            <Mouse sides={settings.mouseSides} offsets={settings.mouseOffsets} />
          {:else if state.screen === 'mouse-request'}
            <MouseRequest device={state.device} address={state.address} />
          {:else if state.screen === 'mouse-active'}
            <MouseActive device={state.device} role={state.role} />
          {:else if state.screen === 'error'}
            <ErrorScreen
              error={state.error}
              mode={state.mode}
              autoReport={$snapshot.settings.autoReport}
            />
          {/if}
        </main>
      {/key}
      <!-- Atualização no rodapé: só aparece com algo a fazer (baixar ou reiniciar). -->
      {#if mode}<UpdateControls compact />{/if}
    </div>
  {/if}
{:else}
  <div class="screen">
    <main class="center">
      {#if $syncError}
        <h1 class="title" role="alert">{$syncError}</h1>
        <p class="subtitle">{errorFix('100')}</p>
        <ErrorCode code="100" />
        <button class="btn btn-primary" onclick={initialize} disabled={syncing}>
          {syncing
            ? L({ pt: 'Carregando…', en: 'Loading…', es: 'Cargando…' })
            : L({ pt: 'Tentar de novo', en: 'Try again', es: 'Intentar de nuevo' })}
        </button>
      {:else}
        <p class="status" role="status">
          {L({
            pt: 'Carregando o Horizonte…',
            en: 'Loading Horizonte…',
            es: 'Cargando Horizonte…'
          })}
        </p>
      {/if}
    </main>
  </div>
{/if}
