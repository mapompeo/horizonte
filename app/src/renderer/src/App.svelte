<script lang="ts">
  import { onMount } from 'svelte'
  import { route, snapshot, startSync } from './lib/store'
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
  import SettingsPage from './screens/SettingsPage.svelte'

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
  {#if $route === 'settings'}
    <SettingsPage {settings} />
  {:else if state.screen === 'install'}
    <Frame><Install /></Frame>
  {:else if state.screen === 'choose'}
    <Frame><Choose /></Frame>
  {:else if state.screen === 'preparing'}
    <Frame mode="send"><Preparing step={state.step} /></Frame>
  {:else if state.screen === 'ready'}
    <Frame mode="send"><Ready deviceName={settings.deviceName} /></Frame>
  {:else if state.screen === 'approve'}
    <Frame><Approve device={state.device} pin={state.pin} /></Frame>
  {:else if state.screen === 'connected'}
    <Frame mode="send" split><Connected device={state.device} bitrate={settings.bitrate} /></Frame>
  {:else if state.screen === 'discover'}
    <Frame mode="receive"><Discover /></Frame>
  {:else if state.screen === 'receiving'}
    <Frame mode="receive" split
      ><Receiving host={state.host} name={state.name} bitrate={settings.bitrate} /></Frame
    >
  {:else if state.screen === 'error'}
    <Frame mode={state.mode}><ErrorScreen error={state.error} /></Frame>
  {/if}
{/if}
