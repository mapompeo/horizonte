<script lang="ts">
  interface Props {
    class?: string
  }

  let { class: className = 'btn btn-ghost' }: Props = $props()
  let state = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  /** Um clique: vai só versão, sistema e códigos de erro (nada de nomes, arquivos ou mensagens). */
  async function send(): Promise<void> {
    if (state === 'sending') return
    state = 'sending'
    try {
      await window.horizonte.reportDiagnostic()
      state = 'sent'
    } catch {
      state = 'failed'
    }
  }
</script>

<button
  class={className}
  onclick={send}
  disabled={state === 'sending' || state === 'sent'}
  aria-live="polite"
>
  {state === 'sending'
    ? 'Enviando…'
    : state === 'sent'
      ? 'Diagnóstico enviado. Obrigado'
      : state === 'failed'
        ? 'Não deu para enviar. Tentar de novo'
        : 'Enviar diagnóstico'}
</button>
