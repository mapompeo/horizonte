<script lang="ts">
  import type { Mode } from '../../../shared/types'
  import { chooseMode, openSettings } from '../lib/actions'
  import Segmented from './Segmented.svelte'
  import UpdateControls from './UpdateControls.svelte'

  interface Props {
    mode: Mode
  }

  let { mode }: Props = $props()
</script>

<header class="topbar">
  <div class="topbar-left">
    <button class="icon-btn" aria-label="Ajustes" onclick={openSettings}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        /><circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </div>
  {#if mode === 'mouse'}
    <!-- O modo Mouse fica nos Ajustes: aqui só o caminho de volta. -->
    <button class="back" onclick={() => chooseMode('send')}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg
      >
      Enviar
    </button>
  {:else}
    <Segmented
      compact
      label="Modo"
      value={mode}
      options={[
        { value: 'send', text: 'Enviar' },
        { value: 'receive', text: 'Receber' }
      ]}
      onSelect={(value) => chooseMode(value as Mode)}
    />
  {/if}
  <div class="topbar-right"><UpdateControls compact /></div>
</header>
