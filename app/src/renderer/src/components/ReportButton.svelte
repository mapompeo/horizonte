<script lang="ts">
  import { L } from '../lib/i18n'
  interface Props {
    class?: string
  }

  let { class: className = 'link' }: Props = $props()
  let state = $state<'idle' | 'sending' | 'sent' | 'saved' | 'failed'>('idle')

  /**
   * Um clique: o relatório (computador, placa de vídeo, telas e o final dos logs, sem pasta pessoal, nomes nem IPs
   * completos) vai para as Issues do GitHub. Sem internet, fica salvo na Área de Trabalho.
   */
  async function send(): Promise<void> {
    if (state === 'sending' || state === 'sent' || state === 'saved') return
    state = 'sending'
    try {
      state = await window.horizonte.reportDiagnostic()
    } catch {
      state = 'failed'
    }
  }

  const spoken = $derived(
    state === 'sending'
      ? L({ pt: 'Enviando diagnóstico', en: 'Sending diagnostics', es: 'Enviando diagnóstico' })
      : state === 'sent'
        ? L({ pt: 'Diagnóstico enviado', en: 'Diagnostics sent', es: 'Diagnóstico enviado' })
        : state === 'saved'
          ? L({
              pt: 'Sem internet: diagnóstico salvo na Área de Trabalho',
              en: 'No internet: diagnostics saved on the Desktop',
              es: 'Sin internet: diagnóstico guardado en el Escritorio'
            })
          : state === 'failed'
            ? L({
                pt: 'Não foi possível enviar o diagnóstico',
                en: 'Could not send the diagnostics',
                es: 'No se pudo enviar el diagnóstico'
              })
            : ''
  )
</script>

<button
  class={className}
  onclick={send}
  aria-disabled={state === 'sending' || state === 'sent' || state === 'saved'}
>
  {state === 'sending'
    ? L({ pt: 'Enviando…', en: 'Sending…', es: 'Enviando…' })
    : state === 'sent'
      ? L({ pt: 'Enviado. Obrigado!', en: 'Sent. Thank you!', es: 'Enviado. ¡Gracias!' })
      : state === 'saved'
        ? L({
            pt: 'Sem internet: salvo na Área de Trabalho',
            en: 'No internet: saved on the Desktop',
            es: 'Sin internet: guardado en el Escritorio'
          })
        : state === 'failed'
          ? L({
              pt: 'Não enviou. Tentar de novo',
              en: 'Not sent. Try again',
              es: 'No se envió. Intentar de nuevo'
            })
          : L({ pt: 'Enviar diagnóstico', en: 'Send diagnostics', es: 'Enviar diagnóstico' })}
</button>
<span class="sr-only" role="status">{spoken}</span>
