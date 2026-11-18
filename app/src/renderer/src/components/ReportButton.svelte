<script lang="ts">
  import { L } from '../lib/i18n'
  interface Props {
    class?: string
  }

  let { class: className = 'link' }: Props = $props()
  let state = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  /** Um clique: vai só versão, sistema e códigos de erro (nada de nomes, arquivos ou mensagens). */
  async function send(): Promise<void> {
    if (state === 'sending' || state === 'sent') return
    state = 'sending'
    try {
      await window.horizonte.reportDiagnostic()
      state = 'sent'
    } catch {
      state = 'failed'
    }
  }

  const spoken = $derived(
    state === 'sending'
      ? L({ pt: 'Enviando diagnóstico', en: 'Sending diagnostics', es: 'Enviando diagnóstico' })
      : state === 'sent'
        ? L({ pt: 'Diagnóstico enviado', en: 'Diagnostics sent', es: 'Diagnóstico enviado' })
        : state === 'failed'
          ? L({
              pt: 'Não foi possível enviar o diagnóstico',
              en: 'Could not send the diagnostics',
              es: 'No se pudo enviar el diagnóstico'
            })
          : ''
  )
</script>

<button class={className} onclick={send} aria-disabled={state === 'sending' || state === 'sent'}>
  {state === 'sending'
    ? L({ pt: 'Enviando…', en: 'Sending…', es: 'Enviando…' })
    : state === 'sent'
      ? L({ pt: 'Enviado', en: 'Sent', es: 'Enviado' })
      : state === 'failed'
        ? L({
            pt: 'Não enviou. Tentar de novo',
            en: 'Not sent. Try again',
            es: 'No se envió. Intentar de nuevo'
          })
        : L({ pt: 'Enviar diagnóstico', en: 'Send diagnostics', es: 'Enviar diagnóstico' })}
</button>
<span class="sr-only" role="status">{spoken}</span>
