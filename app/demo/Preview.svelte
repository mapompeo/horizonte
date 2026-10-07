<script lang="ts">
  import { onMount } from 'svelte'
  import Stepper from '../src/renderer/src/components/Stepper.svelte'
  import Segmented from '../src/renderer/src/components/Segmented.svelte'
  import Pill from '../src/renderer/src/components/Pill.svelte'
  import Approve from '../src/renderer/src/screens/Approve.svelte'
  import Discover from '../src/renderer/src/screens/Discover.svelte'
  import type { Snapshot } from '../src/shared/types'
  let { kind }: { kind: string } = $props()
  let snapshot = $state<Snapshot | null>(null)
  onMount(() => {
    void window.horizonte.getSnapshot().then((next) => (snapshot = next))
    return window.horizonte.onSnapshot((next) => (snapshot = next))
  })
</script>

<div class="preview">
  {#if snapshot}
    {#if kind === 'quality'}
      <Stepper
        bitrate={snapshot.settings.bitrate}
        onChange={(bitrate) => void window.horizonte.updateSettings({ bitrate })}
      />
    {:else if kind === 'mode'}
      <Segmented
        label="Modo"
        options={[
          { value: 'send', text: 'Enviar' },
          { value: 'receive', text: 'Mostrar' }
        ]}
        value={snapshot.settings.mode ?? 'send'}
        onSelect={(mode) =>
          void window.horizonte.dispatch({
            type: 'CHOOSE',
            mode: mode === 'send' ? 'send' : 'receive'
          })}
        compact
      />
    {:else if kind === 'pair'}
      {#if snapshot.state.screen === 'approve'}<Approve device="Notebook" pin="4821" />{:else}<Pill
          tone={snapshot.state.screen === 'connected' ? 'ok' : 'wait'}
          >{snapshot.state.screen === 'connected'
            ? 'Notebook conectado'
            : 'Aguardando conexão'}</Pill
        ><button class="link" onclick={() => window.__demo?.requestConnection()}
          >Pedir novamente</button
        >{/if}
    {:else if kind === 'host'}
      {#if snapshot.state.screen === 'discover'}<Discover />{:else}<Pill tone="ok"
          >Desktop conectado</Pill
        >{/if}
    {/if}
  {/if}
</div>

<style>
  :global(body) {
    background: transparent;
    overflow: hidden;
  }
  .preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    box-sizing: border-box;
    padding: 12px;
    gap: 12px;
  }
  .preview :global(.hosts) {
    width: 100%;
  }
  .preview :global(.title),
  .preview :global(.badge),
  .preview :global(.hint),
  .preview :global(.hosts > h1) {
    display: none;
  }
  .preview :global(.hosts .link) {
    display: none;
  }
</style>
