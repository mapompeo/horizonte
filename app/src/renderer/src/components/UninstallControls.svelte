<script lang="ts">
  let pending = $state(false)
  let message = $state('')
  async function uninstall(): Promise<void> {
    if (pending) return
    pending = true
    message = ''
    try {
      const result = await window.horizonte.uninstall()
      message = {
        started: 'O desinstalador foi aberto.',
        cancelled: '',
        busy: 'Encerre a conexão antes.',
        manual:
          window.horizonte.platform === 'darwin'
            ? 'Mova o Horizonte para o Lixo.'
            : 'Remova nos Ajustes do sistema.',
        unavailable: 'Remova nos Ajustes do sistema.',
        failed: 'Não deu para abrir. Tente de novo.'
      }[result]
    } catch {
      message = 'Não deu para abrir. Tente de novo.'
    } finally {
      pending = false
    }
  }
</script>

<button class="row row-button danger" onclick={uninstall} disabled={pending}
  >{pending ? 'Abrindo…' : 'Desinstalar Horizonte'}</button
>
{#if message}<p class="row-note" role="status">{message}</p>{/if}
