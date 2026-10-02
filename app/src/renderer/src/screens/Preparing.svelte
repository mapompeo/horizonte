<script lang="ts">
  import type { PrepStep } from '../../../shared/types'
  import { copyFor, progress, stepLabel } from '../lib/copy'

  interface Props {
    step: PrepStep
  }

  let { step }: Props = $props()

  const copy = $derived(copyFor({ screen: 'preparing', mode: 'send', step }))
  const percent = $derived(progress(step))
</script>

<h1 class="title">{copy.title}</h1>
<div
  class="bar"
  role="progressbar"
  aria-label="Progresso"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={percent}
>
  <div class="bar-fill" style="width: {percent}%"></div>
</div>
<p class="status" aria-live="polite">
  {#key step}<span class="status-text">{stepLabel(step)}</span>{/key}
</p>
