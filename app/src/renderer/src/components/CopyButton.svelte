<script lang="ts">
  interface Props {
    class?: string
  }

  let { class: className = '' }: Props = $props()

  let status = $state<'idle' | 'copied' | 'failed'>('idle')
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(): Promise<void> {
    try {
      // A cópia é feita pelo app (o navegador embutido falha em alguns sistemas, como o macOS).
      status = (await window.horizonte.copyDiagnostic()) ? 'copied' : 'failed'
    } catch {
      status = 'failed'
    }
    clearTimeout(timer)
    timer = setTimeout(() => (status = 'idle'), 2000)
  }

  $effect(() => () => clearTimeout(timer))
</script>

<button class="{className} copy" class:copied={status === 'copied'} onclick={copy}>
  <span aria-live="polite">
    {#if status === 'copied'}Copiado{:else if status === 'failed'}Não consegui copiar{:else}Copiar
      diagnóstico{/if}
  </span>
</button>
