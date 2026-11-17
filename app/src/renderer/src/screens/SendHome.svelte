<script lang="ts">
  import { onMount } from 'svelte'
  import type { ConnectedDevice, ScreenPlacement, WebAccess } from '../../../shared/types'
  import { placeAll } from '../../../shared/placement'
  import { safeName } from '../lib/copy'
  import { send } from '../lib/actions'
  import { changeWebAccess } from '../lib/store'
  import QrCode from '../components/QrCode.svelte'
  import VideoHint from '../components/VideoHint.svelte'
  import PlacementMap, { type MapScreen } from '../components/PlacementMap.svelte'

  interface Props {
    deviceName: string
    devices: ConnectedDevice[]
    placement: ScreenPlacement
    placements: Record<string, ScreenPlacement>
    /** Ainda preparando o motor: o QR aparece assim que der. */
    preparing?: boolean
  }

  let { deviceName, devices, placement, placements, preparing = false }: Props = $props()

  /** O QR fica sempre ligado: a página abre sozinha, sem botão. */
  let web = $state<WebAccess>({ on: false })
  onMount(() => {
    void (async () => {
      try {
        web = await window.horizonte.getWebAccess()
        if (!web.on && !web.error) web = await changeWebAccess(web)
      } catch {
        // Sem a página do navegador, o resto continua funcionando.
      }
    })()
  })

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
  const code = $derived(web.code ? `${web.code.slice(0, 3)} ${web.code.slice(3)}` : '')
</script>

<div class="home">
  <section class="hero">
    <div class="qr-card" class:waiting={!link}>
      {#if link}
        <QrCode text={link} size={176} />
      {:else}
        <div class="qr-empty" aria-hidden="true"></div>
      {/if}
    </div>
    <div class="hero-text">
      <h1>{devices.length ? 'Conectado' : 'Aponte a câmera'}</h1>
      <p>Celular, tablet, notebook ou outra tela. Quantos quiser.</p>
      {#if link && web.url}
        <div class="code" aria-label="Código {web.code}">{code}</div>
        <span class="url">{web.url.replace(/^https?:\/\//, '')}</span>
      {:else if web.error}
        <span class="url">{web.error}</span>
      {:else}
        <span class="url">{preparing ? 'Preparando…' : 'Abrindo…'}</span>
      {/if}
    </div>
  </section>

  {#if devices.length}
    <ul class="list" aria-label="Aparelhos conectados">
      {#each devices as d (d.fingerprint ?? d.device)}
        <li>
          <span class="dot" aria-hidden="true"></span>
          <span class="name">{safeName(d.device)}</span>
          <button
            class="stop"
            onclick={() =>
              send({ type: 'STOP', ...(d.fingerprint ? { fingerprint: d.fingerprint } : {}) })}
            >Parar</button
          >
        </li>
      {/each}
    </ul>
    {#if screens.length}
      <div class="map">
        <PlacementMap {screens} {placements} height={180} />
      </div>
    {/if}
  {:else}
    <p class="foot">No outro computador com o Horizonte, escolha {safeName(deviceName)}.</p>
  {/if}
  <VideoHint />
</div>

<style>
  .home {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 24px;
    border-radius: 28px;
    background: var(--card);
    text-align: left;
  }
  .qr-card {
    flex: none;
    padding: 10px;
    border-radius: 20px;
    background: #ffffff;
  }
  .qr-empty {
    width: 176px;
    height: 176px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.05);
  }
  .hero-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.4px;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-body);
    line-height: 20px;
  }
  .code {
    margin-top: 10px;
    font-size: 34px;
    font-weight: 600;
    letter-spacing: 2px;
    font-variant-numeric: tabular-nums;
  }
  .url {
    color: var(--muted);
    font-size: var(--t-small);
    overflow-wrap: anywhere;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: 18px;
    background: var(--card);
    overflow: hidden;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    min-height: 48px;
    text-align: left;
  }
  li + li {
    border-top: 0.5px solid var(--line);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ok-dot);
  }
  .name {
    flex: 1;
    font-size: var(--t-body);
  }
  .stop {
    border: 0;
    background: none;
    color: var(--danger-fg);
    font-size: var(--t-body);
    padding: 8px 0;
  }
  .map {
    border-radius: 18px;
    background: var(--card);
    padding: 12px;
  }
  .foot {
    text-align: center;
    font-size: var(--t-small);
  }
  @media (max-width: 560px) {
    .hero {
      flex-direction: column;
      text-align: center;
    }
    .hero-text {
      align-items: center;
    }
  }
</style>
