<script lang="ts">
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'
  import PlacementMap, { type MapScreen } from '../components/PlacementMap.svelte'
  import { placeAll } from '../../../shared/placement'
  import type { ConnectedDevice, ScreenPlacement } from '../../../shared/types'

  interface Props {
    devices: ConnectedDevice[]
    placement: ScreenPlacement
    placements: Record<string, ScreenPlacement>
  }

  let { devices, placement, placements }: Props = $props()

  const copy = $derived(copyFor({ screen: 'connected', mode: 'send', devices }))
  /** No mapa, só quem tem impressão digital e tamanho de tela (motor próprio); na ordem em que conectaram. */
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
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
{#if screens.length > 0}
  <div class="stack gap-xs placement">
    <PlacementMap {screens} {placements} height={220} />
    <p class="hint">Arraste para posicionar.</p>
  </div>
{/if}
{#if devices.length > 1}
  <!-- Várias telas: parar uma por vez, ou todas. -->
  <div class="connected-list">
    {#each devices as d (d.fingerprint ?? d.device)}
      <div class="connected-row">
        <span>{safeName(d.device)}</span>
        {#if d.fingerprint}
          <button
            class="row-action"
            onclick={() => send({ type: 'STOP', fingerprint: d.fingerprint })}>Parar</button
          >
        {/if}
      </div>
    {/each}
  </div>
  <button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Parar todas</button>
{:else}
  <button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Parar</button>
{/if}
