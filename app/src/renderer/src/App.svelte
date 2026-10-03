<script lang="ts">
  import { onMount } from 'svelte'
  import type { AppState, Mode } from '../../shared/types'
  import { route, snapshot, startSync } from './lib/store'
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

<div class="drag-strip" aria-hidden="true"></div>
{#if $snapshot}
  {@const state = $snapshot.state}
  {@const settings = $snapshot.settings}
  {#if $route === 'settings'}
    <SettingsPage {settings} />
  {:else}
    {@const mode = modeOf(state)}
    <div class="screen">
      {#if mode}<TopBar {mode} />{/if}
      {#key state.screen}
        <main
          class="center"
          class:center-split={state.screen === 'connected' || state.screen === 'receiving'}
        >
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
{/if}
