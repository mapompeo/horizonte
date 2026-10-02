<script lang="ts">
  import type { Mode } from '../../../shared/types'
  import { chooseMode, openSettings } from '../lib/actions'

  interface Props {
    mode: Mode
  }

  let { mode }: Props = $props()
</script>

<header class="topbar">
  <span></span>
  <div class="seg" role="group" aria-label="Modo">
    <button class="seg-item" class:on={mode === 'send'} aria-pressed={mode === 'send'} onclick={() => chooseMode('send')}>
      Enviar
    </button>
    <button class="seg-item" class:on={mode === 'receive'} aria-pressed={mode === 'receive'} onclick={() => chooseMode('receive')}>
      Mostrar
    </button>
  </div>
  <div class="topbar-right">
    <button class="icon-btn" aria-label="Ajustes" onclick={openSettings}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />
      </svg>
    </button>
  </div>
</header>
