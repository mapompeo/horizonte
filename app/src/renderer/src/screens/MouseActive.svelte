<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'

  interface Props {
    device: string
    role: 'share' | 'follow'
  }

  let { device, role }: Props = $props()

  const copy = $derived(copyFor({ screen: 'mouse-active', mode: 'mouse', device, role }))
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Parar</button>
