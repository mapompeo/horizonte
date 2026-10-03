<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'

  const copy = copyFor({ screen: 'install' })
</script>

<div class="stack gap-sm">
  <div class="mark" aria-hidden="true">
    <svg
      width="44"
      height="44"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="4" y="8" width="26" height="18" rx="3.5" /><rect
        x="18"
        y="20"
        width="26"
        height="18"
        rx="3.5"
      />
    </svg>
  </div>
  <span class="wordmark">Horizonte</span>
</div>
<div class="stack gap-sm">
  <h1 class="title title-lg">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<div class="stack gap-sm">
  <button class="btn btn-primary" onclick={() => send({ type: 'INSTALL_DONE' })}>Instalar</button>
</div>
