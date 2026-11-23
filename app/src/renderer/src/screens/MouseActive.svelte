<script lang="ts">
  import { L } from '../lib/i18n'
  import { copyFor, safeName } from '../lib/copy'
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
  {#if copy.subtitle}<p class="subtitle">{copy.subtitle}</p>{/if}
</div>
<button
  class="btn btn-danger"
  aria-label={`${L({ pt: 'Parar', en: 'Stop', es: 'Detener' })} ${safeName(device)}`}
  onclick={() => send({ type: 'STOP' })}>{L({ pt: 'Parar', en: 'Stop', es: 'Detener' })}</button
>
