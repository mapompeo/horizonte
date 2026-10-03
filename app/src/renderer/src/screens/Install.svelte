<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'

  const copy = copyFor({ screen: 'install' })

  // Depois de Instalar, uma tela avisa que o Windows vai pedir permissão, antes de o aviso aparecer.
  let explaining = $state(false)
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
{#if explaining}
  <div class="stack gap-sm">
    <h1 class="title title-lg">O Windows vai pedir permissão.</h1>
    <p class="subtitle">
      Quando aparecer o aviso, clique em Sim. É só dessa vez, para instalar o motor de transmissão e
      o monitor virtual.
    </p>
  </div>
  <div class="stack gap-sm">
    <button class="btn btn-primary" onclick={() => send({ type: 'INSTALL_DONE' })}>
      Entendi, continuar
    </button>
  </div>
{:else}
  <div class="stack gap-sm">
    <h1 class="title title-lg">{copy.title}</h1>
    <p class="subtitle">{copy.subtitle}</p>
  </div>
  <div class="stack gap-sm">
    <button class="btn btn-primary" onclick={() => (explaining = true)}>Instalar</button>
  </div>
{/if}
