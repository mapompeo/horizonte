<script lang="ts">
  import { copyFor, safeName } from '../lib/copy'
  import Pill from '../components/Pill.svelte'

  interface Props {
    deviceName: string
  }

  let { deviceName }: Props = $props()

  const copy = copyFor({ screen: 'ready', mode: 'send' })
</script>

{#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
<h1 class="title">{copy.title}</h1>
<p class="subtitle">{copy.subtitle}</p>
<span class="hint">Nome deste dispositivo: <strong>{safeName(deviceName)}</strong></span>
