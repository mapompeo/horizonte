<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'

  interface Props {
    host: string
    name: string
  }

  let { host, name }: Props = $props()

  const copy = $derived(copyFor({ screen: 'receiving', mode: 'receive', host, name }))
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
<button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Sair</button>
