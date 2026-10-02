<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { patchSettings, send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'
  import Stepper from '../components/Stepper.svelte'

  interface Props {
    host: string
    bitrate: number
  }

  let { host, bitrate }: Props = $props()

  const copy = $derived(copyFor({ screen: 'receiving', mode: 'receive', host }))
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
<div class="stack gap-md">
  <Stepper {bitrate} onChange={(mbps) => patchSettings({ bitrate: mbps })} />
  <button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Sair</button>
</div>
