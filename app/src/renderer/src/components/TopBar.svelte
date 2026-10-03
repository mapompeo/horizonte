<script lang="ts">
  import type { Mode } from '../../../shared/types'
  import { chooseMode, openSettings } from '../lib/actions'
  import Segmented from './Segmented.svelte'

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
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle
          cx="9"
          cy="17"
          r="2"
        />
      </svg>
    </button>
  </div>
  <Segmented
    compact
    label="Modo"
    value={mode}
    options={[
      { value: 'send', text: 'Enviar' },
      { value: 'receive', text: 'Mostrar' }
    ]}
    onSelect={(value) => chooseMode(value as Mode)}
  />
  <span></span>
</header>
