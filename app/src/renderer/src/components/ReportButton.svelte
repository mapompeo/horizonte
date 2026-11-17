<script lang="ts">
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
      ? 'Enviando diagnóstico'
      : state === 'sent'
        ? 'Diagnóstico enviado'
        : state === 'failed'
          ? 'Não foi possível enviar o diagnóstico'
          : ''
  )
</script>

<button class={className} onclick={send} aria-disabled={state === 'sending' || state === 'sent'}>
  {state === 'sending'
    ? 'Enviando…'
    : state === 'sent'
      ? 'Enviado'
      : state === 'failed'
        ? 'Não enviou. Tentar de novo'
        : 'Enviar diagnóstico'}
</button>
<span class="sr-only" role="status">{spoken}</span>
