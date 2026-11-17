<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly, scale, slide } from 'svelte/transition'
  import { backOut } from 'svelte/easing'
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
    devices: ConnectedDevice[]
    placement: ScreenPlacement
    placements: Record<string, ScreenPlacement>
    /** Ainda preparando: no lugar do QR, o andamento. */
    preparing?: boolean
    progress?: PrepProgress
  }

  let { devices, placement, placements, preparing = false, progress }: Props = $props()

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
  const link = $derived(web.on && web.url ? `${web.url}/${web.code}` : null)
  const code = $derived(web.code ?? '')
  const connected = $derived(devices.length > 0)

  /** Copia o link da página (com o código): para colar no navegador de outro PC. */
  let copied = $state(false)
  async function copyLink(): Promise<void> {
    if (!link) return
    try {
      await window.horizonte.copyText(link)
      copied = true
      setTimeout(() => (copied = false), 2000)
    } catch {
      // Sem área de transferência: o endereço continua à vista para digitar.
    }
  }
  /** QR ampliado: ocupa a janela toda, para a câmera achar de longe. */
  let zoomed = $state(false)
  let viewport = $state({ w: 800, h: 600 })
  const bigQr = $derived(Math.max(176, Math.min(viewport.w, viewport.h) - 200))
  /** Aberto o "Adicionar": o QR, o código e o link para mais um aparelho. */
  let adding = $state(false)
  /** Quem não tem tela no mapa (sem tamanho ou impressão digital): fica numa lista simples. */
  const unmapped = $derived(devices.filter((d) => !d.fingerprint || !d.peerScreen))
  function stop(fingerprint?: string): void {
    void send({ type: 'STOP', ...(fingerprint ? { fingerprint } : {}) })
  }

  const prepNote = $derived(
    progress?.permission ? 'Confirme a permissão do sistema' : progress?.note || 'Preparando'
  )
</script>

{#snippet hero(compact: boolean)}
  <section class="hero card" class:compact class:vertical={!compact}>
    <div class="qr-card" class:compact>
      {#if link}
        <button class="qr-zoom" aria-label="Ampliar o QR code" onclick={() => (zoomed = true)}
          ><QrCode text={link} size={compact ? 112 : 176} /></button
        >
      {:else if preparing}
        <div class="qr-prep" class:compact role="status">
          <div class="bar">
            <div
              class="bar-fill"
              style="width: {Math.round((progress?.fraction ?? 0) * 100)}%"
            ></div>
          </div>
          <span class="hint">{prepNote}</span>
        </div>
      {:else}
        <div class="qr-empty" class:compact aria-hidden="true"></div>
      {/if}
    </div>
    <div class="hero-text" aria-live="polite">
      {#if !compact}
        <h1 class="title">{preparing ? 'Preparando' : 'Aponte a câmera'}</h1>
      {/if}
      {#if link && web.url && !compact}
        <!-- Sem câmera (outro PC, tablet): o endereço e o código numa linha só; Copiar leva os dois juntos. -->
        <span class="address" title="Abra no navegador de outro aparelho">
          <span class="address-text">{web.url.replace(/^https?:\/\//, '')}/</span>
          <span class="address-code" aria-label="Código {web.code?.split('').join(' ')}"
            >{code}</span
          >
          <button class="copy" class:done={copied} onclick={copyLink}
            >{#key copied}<span
                class="copy-label"
                in:scale={{ start: 0.7, duration: ms(260), easing: backOut }}
                >{copied ? 'Copiado' : 'Copiar link'}</span
              >{/key}</button
          >
        </span>
      {:else if link && web.url}
        <span class="code" role="img" aria-label="Código {web.code?.split('').join(' ')}"
          >{code}</span
        >
        <!-- Outro PC ou aparelho sem câmera: o mesmo link, para abrir no navegador (o código já vai junto). -->
        <span class="web-link">
          <span class="hint">{web.url.replace(/^https?:\/\//, '')}</span>
          <button class="link link-sm" onclick={copyLink}
            >{copied ? 'Copiado' : 'Copiar link'}</button
          >
        </span>
      {:else if web.error}
        <span class="hint danger-text">{web.error}</span>
        <button class="link" onclick={ensureWeb}>Tentar de novo</button>
      {:else if !preparing}
        <span class="hint">Abrindo…</span>
      {/if}
    </div>
  </section>
{/snippet}

<div class="home">
  {#if connected}
    <!-- Conectado: a mesa é a tela. O QR só aparece para adicionar mais um. -->
    <div class="status">
      <h1 class="title">
        {#key devices.length}<span class="count" in:fly={{ y: -10, duration: ms(320) }}
            >{devices.length}</span
          >{/key}
        {devices.length === 1 ? 'tela conectada' : 'telas conectadas'}
      </h1>
      <button class="add" aria-expanded={adding} onclick={() => (adding = !adding)}
        >{adding ? 'Fechar' : '+ Adicionar'}</button
      >
    </div>
    {#if adding}
      <div transition:slide={{ duration: ms(300) }}>
        {@render hero(true)}
      </div>
    {/if}
    {#if screens.length}
      <div class="card card-pad">
        <PlacementMap {screens} {placements} height={adding ? 220 : 320} onStop={stop} />
      </div>
    {/if}
    {#if unmapped.length}
      <ul class="card list" role="list" aria-live="polite" aria-label="Aparelhos conectados">
        {#each unmapped as d (d.fingerprint ?? d.device)}
          <li class="row">
            <span class="peer-dot" aria-hidden="true"></span>
            <span class="peer-name">{safeName(d.device)}</span>
            <button
              class="row-action danger"
              aria-label="Parar {safeName(d.device)}"
              onclick={() => stop(d.fingerprint)}>Parar</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    {@render hero(false)}
  {/if}
  <VideoHint />
</div>

<svelte:window
  bind:innerWidth={viewport.w}
  bind:innerHeight={viewport.h}
  onkeydown={(e) => e.key === 'Escape' && (zoomed = false)}
/>
{#if zoomed && link}
  <!-- Toque em qualquer lugar (ou Esc) e o QR volta para o cartão. -->
  <button
    class="qr-big"
    aria-label="Fechar o QR ampliado"
    onclick={() => (zoomed = false)}
    transition:fade={{ duration: ms(200) }}
  >
    <span class="qr-big-card" transition:scale={{ start: 0.6, duration: ms(380), easing: backOut }}>
      <QrCode text={link} size={bigQr} />
    </span>
  </button>
{/if}

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .status .title {
    margin: 0;
    text-align: left;
  }
  .add {
    flex: none;
    min-height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    font-size: var(--t-small);
    font-weight: 600;
    white-space: nowrap;
  }
  .add:hover {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  /* Sem ninguém conectado: tudo em coluna, centralizado (QR, pedido, endereço e código). */
  :global(.hero.vertical) {
    /* Do tamanho do que tem dentro (QR, pedido e endereço), centralizado: sem sobra cinza dos lados. */
    align-self: center;
    width: fit-content;
    max-width: 100%;
    margin-inline: auto;
    flex-direction: column;
    gap: 18px;
    padding: 28px 32px 30px;
    text-align: center;
  }
  :global(.hero.vertical .hero-text) {
    align-items: center;
    gap: 14px;
  }
  :global(.hero.vertical .title) {
    text-align: center;
  }
  .address {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 6px 6px 6px 16px;
    border-radius: 999px;
    background: var(--seg);
    max-width: 100%;
  }
  .address-code {
    /* Colado na barra: "192.168.1.7:47920/8775" se lê como um endereço só. */
    margin-left: -11px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .copy {
    min-height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: var(--t-small);
    font-weight: 600;
    white-space: nowrap;
  }
  .copy {
    transition:
      background-color 0.25s ease,
      transform 0.15s ease;
  }
  .copy:active {
    transform: scale(0.96);
  }
  .copy.done {
    background: var(--ok-dot);
  }
  .count {
    display: inline-block;
  }
  .address-text {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    user-select: all;
  }
  .web-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .link-sm {
    min-height: 32px;
    padding: 0 4px;
    font-size: var(--t-small);
  }
  .copy-label {
    display: inline-block;
  }
  .qr-zoom {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    cursor: zoom-in;
    border-radius: inherit;
  }
  .qr-big {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    border: 0;
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    backdrop-filter: blur(18px);
    cursor: zoom-out;
    -webkit-app-region: no-drag;
  }
  .qr-big-card {
    display: block;
    padding: 22px;
    border-radius: 32px;
    background: #fff;
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.5);
  }
</style>
