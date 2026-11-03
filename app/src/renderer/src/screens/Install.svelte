<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'
  import Logo from '../components/Logo.svelte'

  const copy = copyFor({ screen: 'install' })
</script>

<div class="stack gap-sm">
  <Logo size={76} />
  <span class="wordmark">Horizonte</span>
</div>
<div class="stack gap-sm">
  <h1 class="title title-lg">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<div class="stack gap-sm">
  <button class="btn btn-primary" onclick={() => send({ type: 'INSTALL_DONE' })}>Começar</button>
</div>
