<script lang="ts">
  import { L } from '../lib/i18n'
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
        unavailable: L({
          pt: 'Este Horizonte não foi instalado por um instalador. Apague o arquivo dele.',
          en: 'This Horizonte was not installed by an installer. Delete its file.',
          es: 'Este Horizonte no se instaló con un instalador. Borra su archivo.'
        }),
        failed: L({
          pt: 'Não deu para desinstalar. Tente de novo.',
          en: 'Could not uninstall. Try again.',
          es: 'No se pudo desinstalar. Inténtalo de nuevo.'
        })
      }[result]
    } catch {
      message = L({
        pt: 'Não deu para desinstalar. Tente de novo.',
        en: 'Could not uninstall. Try again.',
        es: 'No se pudo desinstalar. Inténtalo de nuevo.'
      })
    } finally {
      pending = false
    }
  }
</script>

<button class="row row-button danger" onclick={uninstall} disabled={pending}
  >{pending
    ? L({ pt: 'Desinstalando…', en: 'Uninstalling…', es: 'Desinstalando…' })
    : L({
        pt: 'Desinstalar Horizonte',
        en: 'Uninstall Horizonte',
        es: 'Desinstalar Horizonte'
      })}</button
>
{#if message}<p class="row-note" role="status">{message}</p>{/if}
