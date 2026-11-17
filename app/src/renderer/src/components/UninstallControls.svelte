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
        started: '',
        cancelled: '',
        busy: '',
        manual: '',
        unavailable: 'Este Horizonte não foi instalado por um instalador. Apague o arquivo dele.',
        failed: 'Não deu para desinstalar. Tente de novo.'
      }[result]
    } catch {
      message = 'Não deu para desinstalar. Tente de novo.'
    } finally {
      pending = false
    }
  }
</script>

<button class="row row-button danger" onclick={uninstall} disabled={pending}
  >{pending ? 'Desinstalando…' : 'Desinstalar Horizonte'}</button
>
{#if message}<p class="row-note" role="status">{message}</p>{/if}
