<script lang="ts">
  import { onMount } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fade, fly } from 'svelte/transition'
  import type {
    ConnectedDevice,
    PrepProgress,
    ScreenPlacement,
    WebAccess
  } from '../../../shared/types'
  import { placeAll } from '../../../shared/placement'
  import { safeName } from '../lib/copy'
  import { send } from '../lib/actions'
  import { ms } from '../lib/motion'
  import QrCode from '../components/QrCode.svelte'
  import VideoHint from '../components/VideoHint.svelte'
  import PlacementMap, { type MapScreen } from '../components/PlacementMap.svelte'

  interface Props {
    deviceName: string
    devices: ConnectedDevice[]
    placement: ScreenPlacement
    placements: Record<string, ScreenPlacement>
    /** Ainda preparando: no lugar do QR, o andamento. */
    preparing?: boolean
    progress?: PrepProgress
  }

  let { deviceName, devices, placement, placements, preparing = false, progress }: Props = $props()

  /** O QR fica sempre ligado: a página abre sozinha, sem botão. */
  let web = $state<WebAccess>({ on: false })

  async function ensureWeb(): Promise<void> {
    try {
      web = await window.horizonte.getWebAccess()
      if (!web.on) web = await window.horizonte.setWebAccess(true)
    } catch {
      web = { on: false, error: 'Não deu para abrir a página. Tente de novo.' }
    }
  }
  onMount(() => void ensureWeb())

  const screens = $derived.by((): MapScreen[] => {
    const shown = devices.filter((d) => d.fingerprint && d.peerScreen)
    const at = placeAll(
      shown.map((d) => d.fingerprint),
      placements,
      placement
    )
    return shown.map((d, i) => ({
      key: d.fingerprint as string,
      name: d.device,
      screen: d.peerScreen as NonNullable<ConnectedDevice['peerScreen']>,
      placement: at[i]
    }))
  })
  const link = $derived(web.on && web.url ? `${web.url}/#${web.code}` : null)
  const code = $derived(web.code ?? '')
  const connected = $derived(devices.length > 0)

  /** Copia o link da página (com o código): para colar no navegador de outro PC. */
  let copied = $state(false)
  async function copyLink(): Promise<void> {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      copied = true
      setTimeout(() => (copied = false), 2000)
    } catch {
      // Sem área de transferência: o endereço continua à vista para digitar.
    }
  }
  const prepNote = $derived(
    progress?.permission ? 'Confirme a permissão do sistema' : progress?.note || 'Preparando'
  )
</script>

<div class="home">
  <section class="hero card" class:compact={connected}>
    <div class="qr-card" class:compact={connected}>
      {#if link}
        <QrCode text={link} size={connected ? 112 : 176} />
      {:else if preparing}
        <div class="qr-prep" class:compact={connected} role="status">
          <div class="bar">
            <div
              class="bar-fill"
              style="width: {Math.round((progress?.fraction ?? 0) * 100)}%"
            ></div>
          </div>
          <span class="hint">{prepNote}</span>
        </div>
      {:else}
        <div class="qr-empty" class:compact={connected} aria-hidden="true"></div>
      {/if}
    </div>
    <div class="hero-text" aria-live="polite">
      <h1 class="title">
        {connected ? 'Conectado' : preparing ? 'Preparando' : 'Aponte a câmera'}
      </h1>
      {#if link && web.url}
        <span class="code" role="img" aria-label="Código {web.code?.split('').join(' ')}"
          >{code}</span
        >
        <!-- Outro PC ou aparelho sem câmera: o mesmo link, para abrir no navegador (o código já vai junto). -->
        <span class="web-link">
          <span class="hint">{web.url.replace(/^https?:\/\//, '')}</span>
          <button class="link link-sm" onclick={copyLink}>{copied ? 'Copiado' : 'Copiar link'}</button>
        </span>
      {:else if web.error}
        <span class="hint danger-text">{web.error}</span>
        <button class="link" onclick={ensureWeb}>Tentar de novo</button>
      {:else if !preparing}
        <span class="hint">Abrindo…</span>
      {/if}
    </div>
  </section>

  {#if connected}
    <ul class="card list" role="list" aria-live="polite" aria-label="Aparelhos conectados">
      {#each devices as d (d.fingerprint ?? d.device)}
        <li
          class="row"
          animate:flip={{ duration: ms(240) }}
          in:fly={{ y: 8, duration: ms(260) }}
          out:fade={{ duration: ms(120) }}
        >
          <span class="peer-dot" aria-hidden="true"></span>
          <span class="peer-name">{safeName(d.device)}</span>
          <button
            class="row-action danger"
            aria-label="Parar {safeName(d.device)}"
            onclick={() =>
              send({ type: 'STOP', ...(d.fingerprint ? { fingerprint: d.fingerprint } : {}) })}
            >Parar</button
          >
        </li>
      {/each}
    </ul>
    {#if screens.length}
      <div class="card card-pad">
        <PlacementMap {screens} {placements} height={180} />
      </div>
    {/if}
  {:else}
    <p class="hint">Ou escolha {safeName(deviceName)} no outro aparelho</p>
  {/if}
  <VideoHint />
</div>
