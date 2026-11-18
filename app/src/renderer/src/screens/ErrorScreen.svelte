<script lang="ts">
  import { L } from '../lib/i18n'
  import type { AppError, Mode } from '../../../shared/types'
  import { chooseMode, send } from '../lib/actions'
  import ReportButton from '../components/ReportButton.svelte'

  interface Props {
    error: AppError
    mode: Mode
  }

  let { error, mode }: Props = $props()
</script>

<div class="badge badge-danger" aria-hidden="true">
  <svg
    width="34"
    height="34"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 8v5M12 16.5v.01" /><path
      d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
    />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title">{error.message}</h1>
  <p class="subtitle">{L({ pt: 'Tente de novo.', en: 'Try again.', es: 'Inténtalo de nuevo.' })}</p>
</div>
<div class="stack gap-xs">
  <button class="btn btn-primary" onclick={() => send({ type: 'RETRY' })}
    >{L({ pt: 'Tentar de novo', en: 'Try again', es: 'Intentar de nuevo' })}</button
  >
  <ReportButton class="link" />
  {#if mode !== 'send'}
    <button class="link" onclick={() => chooseMode('send')}
      >{L({ pt: 'Voltar para Enviar', en: 'Back to Send', es: 'Volver a Enviar' })}</button
    >
  {/if}
</div>
