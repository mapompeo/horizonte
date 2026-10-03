<script lang="ts">
  import type { PrepProgress, PrepStep } from '../../../shared/types'
  import { copyFor, stepEnd, stepLabel, stepStart } from '../lib/copy'

  interface Props {
    step: PrepStep
    progress?: PrepProgress
  }

  let { step, progress }: Props = $props()

  const copy = $derived(copyFor({ screen: 'preparing', mode: 'send', step }))
  // O texto é sempre o que o motor está fazendo de verdade; sem aviso novo, vale o nome da etapa.
  const note = $derived(progress?.note ? progress.note : stepLabel(step))
  const real = $derived(Math.max(progress?.fraction ?? 0, stepStart(step)))

  // Entre dois avisos reais a barra segue em linha reta e devagar, sem nunca passar do fim da etapa
  // nem ficar muito à frente do que de fato aconteceu.
  const CREEP_PER_SECOND = 0.006
  const CREEP_LIMIT = 0.06
  let creep = $state(0)
  $effect(() => {
    void real
    creep = 0
    const timer = setInterval(() => {
      creep = Math.min(creep + CREEP_PER_SECOND / 4, CREEP_LIMIT)
    }, 250)
    return () => clearInterval(timer)
  })

  const percent = $derived(
    Math.round(Math.min(real + creep, Math.max(real, stepEnd(step) - 0.01)) * 1000) / 10
  )
</script>

<h1 class="title">{copy.title}</h1>
<div
  class="bar"
  role="progressbar"
  aria-label="Progresso"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={Math.round(percent)}
>
  <div class="bar-fill" style="width: {percent}%"></div>
</div>
<p class="status" aria-live="polite">
  {#key note}<span class="status-text">{note}</span>{/key}
</p>
