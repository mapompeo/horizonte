<script lang="ts">
  import { onMount } from 'svelte'
  import type { AppState, Mode } from '../../shared/types'
  import { route, snapshot, startSync, syncError } from './lib/store'
  import TopBar from './components/TopBar.svelte'
  import Install from './screens/Install.svelte'
  import Choose from './screens/Choose.svelte'
  import Preparing from './screens/Preparing.svelte'
  import Ready from './screens/Ready.svelte'
  import Approve from './screens/Approve.svelte'
  import Connected from './screens/Connected.svelte'
  import Discover from './screens/Discover.svelte'
  import Receiving from './screens/Receiving.svelte'
  import ErrorScreen from './screens/ErrorScreen.svelte'
  import SettingsPage from './screens/SettingsPage.svelte'

  /** Em quais telas o seletor Enviar/Mostrar aparece (e qual lado está ativo). */
  function modeOf(state: AppState): Mode | null {
    switch (state.screen) {
      case 'preparing':
      case 'ready':
      case 'connected':
        return 'send'
      case 'discover':
      case 'receiving':
        return 'receive'
      case 'error':
        return state.mode
      default:
        return null
    }
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

  onMount(() => {
    void initialize()
    return () => {
      disposed = true
      stop?.()
    }
  })
</script>

<div class="drag-strip" aria-hidden="true"></div>
{#if $snapshot}
  {@const state = $snapshot.state}
  {@const settings = $snapshot.settings}
  {#if $route === 'settings' && state.screen !== 'error' && state.screen !== 'approve'}
    <SettingsPage {settings} />
  {:else}
    {@const mode = modeOf(state)}
    <div class="screen">
      {#if mode}<TopBar {mode} />{/if}
      {#key state.screen}
        <main class="center">
          {#if state.screen === 'install'}
            <Install />
          {:else if state.screen === 'choose'}
            <Choose />
          {:else if state.screen === 'preparing'}
            <Preparing step={state.step} progress={state.progress} />
          {:else if state.screen === 'ready'}
            <Ready deviceName={settings.deviceName} />
          {:else if state.screen === 'approve'}
            <Approve device={state.device} pin={state.pin} />
          {:else if state.screen === 'connected'}
            <Connected device={state.device} bitrate={settings.bitrate} />
          {:else if state.screen === 'discover'}
            <Discover />
          {:else if state.screen === 'receiving'}
            <Receiving host={state.host} name={state.name} bitrate={settings.bitrate} />
          {:else if state.screen === 'error'}
            <ErrorScreen error={state.error} />
          {/if}
        </main>
      {/key}
    </div>
  {/if}
{:else}
  <div class="screen">
    <main class="center">
      {#if $syncError}
        <h1 class="title title-md" role="alert">{$syncError}</h1>
        <button class="btn btn-primary" onclick={initialize} disabled={syncing}>
          {syncing ? 'Carregando…' : 'Tentar de novo'}
        </button>
      {:else}
        <p class="status" role="status">Carregando o Horizonte…</p>
      {/if}
    </main>
  </div>
{/if}
