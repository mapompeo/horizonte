<script lang="ts">
  import { onMount } from 'svelte'
  import type { WebAccess } from '../../../shared/types'
  import { copyFor, readySubtitle } from '../lib/copy'
  import Pill from '../components/Pill.svelte'
  import { changeWebAccess } from '../lib/store'

  interface Props {
    deviceName: string
  }

  let { deviceName }: Props = $props()

  const copy = copyFor({ screen: 'ready', mode: 'send' })

  let web = $state<WebAccess>({ on: false })
  let busy = $state(false)

  onMount(() => {
    window.horizonte
      .getWebAccess()
      .then((access) => (web = access))
      .catch(() => undefined)
  })

  async function toggle(): Promise<void> {
    if (busy) return
    busy = true
    try {
      web = await changeWebAccess(web)
    } finally {
      busy = false
    }
  }
</script>

{#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
<h1 class="title">{copy.title}</h1>
<p class="subtitle">{readySubtitle(deviceName)}</p>

<div class="stack gap-sm">
  <button class="btn btn-outline btn-sm" onclick={toggle} disabled={busy}>
    {busy
      ? web.on
        ? 'Desligando…'
        : 'Ligando…'
      : web.on
        ? 'Parar de receber pelo navegador'
        : 'Receber pelo navegador (sem instalar nada)'}
  </button>
  {#if web.on}
    <p class="hint">
      No outro dispositivo, abra
      {#if web.url}<strong>{web.url}</strong>{:else}o endereço deste dispositivo na porta 8080{/if}
      e entre com o usuário <strong>{web.user}</strong> e o código <strong>{web.code}</strong>.
    </p>
  {/if}
  {#if web.error}<p class="hint hint-faint">{web.error}</p>{/if}
</div>
