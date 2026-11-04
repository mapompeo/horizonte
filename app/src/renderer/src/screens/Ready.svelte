<script lang="ts">
  import VideoHint from '../components/VideoHint.svelte'
  import { onMount } from 'svelte'
  import type { WebAccess } from '../../../shared/types'
  import { copyFor, readySubtitle } from '../lib/copy'
  import QrCode from '../components/QrCode.svelte'
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

<h1 class="title">{copy.title}</h1>
<p class="subtitle">{readySubtitle(deviceName)}</p>
<VideoHint />

{#if web.on && web.url}
  <div class="web-card">
    <!-- O código vai junto no link: a página já abre com ele preenchido. -->
    <QrCode text={`${web.url}/#${web.code}`} />
    <div class="web-info">
      <span class="web-url">{web.url.replace(/^https?:\/\//, '')}</span>
      <span class="web-code">{web.code}</span>
      <button class="link" onclick={toggle} disabled={busy}>Parar</button>
    </div>
  </div>
{:else}
  <button class="btn btn-outline btn-sm" onclick={toggle} disabled={busy}>
    {busy ? 'Abrindo…' : 'Mostrar num celular ou tablet'}
  </button>
{/if}
{#if web.error}<p class="hint">{web.error}</p>{/if}
