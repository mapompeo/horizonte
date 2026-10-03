<script lang="ts">
  import type { PrepProgress, PrepStep } from '../../../shared/types'
  import { copyFor, patientNote, stepEnd, stepLabel, stepStart } from '../lib/copy'

  interface Props {
    step: PrepStep
    progress?: PrepProgress
  }

  let { step, progress }: Props = $props()

  const copy = $derived(copyFor({ screen: 'preparing', mode: 'send', step }))
  // O texto é sempre o que o motor está fazendo de verdade; sem aviso novo, vale o nome da etapa.
  const note = $derived(progress?.note ? progress.note : stepLabel(step))
  const real = $derived(Math.max(progress?.fraction ?? 0, stepStart(step)))

  // Quando a preparação é só uma conferência rápida, a tela nem aparece: sem piscar o texto à toa.
  let visible = $state(false)
  $effect(() => {
    const timer = setTimeout(() => (visible = true), 700)
    return () => clearTimeout(timer)
  })

  // Segundos desde que a frase ou a fração mudaram pela última vez.
  let seconds = $state(0)
  $effect(() => {
    void note
    void real
    seconds = 0
    const timer = setInterval(() => (seconds += 0.25), 250)
    return () => clearInterval(timer)
  })

  // Entre dois avisos reais a barra segue crescendo em linha suave e devagar: nunca para, e se
  // aproxima do fim da etapa sem chegar nele (e sem passar de 20% à frente do que de fato aconteceu).
  const CREEP_TIME_CONSTANT = 40
  const shown = $derived.by(() => {
    const room = Math.min(stepEnd(step) - 0.01 - real, 0.2)
    return real + Math.max(room, 0) * (1 - Math.exp(-seconds / CREEP_TIME_CONSTANT))
  })
  const percent = $derived(Math.round(shown * 1000) / 10)
</script>

{#if visible}
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
    {#key note}<span class="status-text">{patientNote(note, seconds)}</span>{/key}
  </p>
{/if}
