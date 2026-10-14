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
        busy: 'Encerre a conexão e aguarde a atualização antes de desinstalar.',
        manual:
          window.horizonte.platform === 'darwin'
            ? 'Feche o Horizonte e mova-o de Aplicativos para a Lixeira.'
            : 'Feche o Horizonte e remova-o pelo gerenciador de aplicativos. Para AppImage, exclua o arquivo baixado.',
        unavailable:
          'Use Aplicativos instalados nas configurações do sistema para remover o Horizonte.',
        failed: 'Não consegui abrir o desinstalador. Tente pelas configurações do sistema.'
      }[result]
    } catch {
      message = 'Não consegui abrir o desinstalador. Tente de novo.'
    } finally {
      pending = false
    }
  }
</script>

<button class="row row-button danger" onclick={uninstall} disabled={pending}
  >{pending ? 'Abrindo…' : 'Desinstalar Horizonte'}</button
>
{#if message}<p class="row-note" role="status">{message}</p>{/if}
