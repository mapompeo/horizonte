<script lang="ts">
  import type { PrepStep } from '../../../shared/types'
  import { copyFor, progress, stepPhrase } from '../lib/copy'

  interface Props {
    step: PrepStep
  }

  let { step }: Props = $props()

  const copy = $derived(copyFor({ screen: 'preparing', mode: 'send', step }))
  const percent = $derived(progress(step))

  let tick = $state(0)
  $effect(() => {
    void step
    tick = 0
    const timer = setInterval(() => (tick += 1), 3500)
    return () => clearInterval(timer)
  })
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
  {#key `${step}-${tick}`}<span class="status-text">{stepPhrase(step, tick)}</span>{/key}
</p>
