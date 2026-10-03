<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { chooseMode } from '../lib/actions'

  const copy = copyFor({ screen: 'choose' })
</script>

<h1 class="title title-md">{copy.title}</h1>
<div class="choices">
  <button class="choice" onclick={() => chooseMode('send')}>
    <svg
      width="44"
      height="44"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="30" height="22" rx="4" /><path d="M14 38h10M19 30v8" /><path
        d="M30 20h14M38 14l6 6-6 6"
      />
    </svg>
    <span class="stack gap-xs">
      <span class="choice-name">Enviar a tela</span>
      <span class="choice-sub">É o dispositivo principal.</span>
    </span>
  </button>
  <button class="choice" onclick={() => chooseMode('receive')}>
    <svg
      width="44"
      height="44"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="14" y="8" width="30" height="22" rx="4" /><path d="M24 38h10M29 30v8" /><path
        d="M18 20H4M10 14l-6 6 6 6"
      />
    </svg>
    <span class="stack gap-xs">
      <span class="choice-name">Mostrar a tela</span>
      <span class="choice-sub">É o dispositivo que recebe.</span>
    </span>
  </button>
</div>
<span class="hint">Você troca com um clique, a qualquer momento.</span>
