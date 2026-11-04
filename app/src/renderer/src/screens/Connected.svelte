<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'
  import PlacementMap from '../components/PlacementMap.svelte'
  import type { ScreenPlacement, ScreenSize } from '../../../shared/types'

  interface Props {
    device: string
    /** Motor próprio: quem está mostrando e o tamanho da tela dele (sem isso, não há mapa). */
    fingerprint?: string
    peerScreen?: ScreenSize
    placement: ScreenPlacement
  }

  let { device, fingerprint, peerScreen, placement }: Props = $props()

  const copy = $derived(copyFor({ screen: 'connected', mode: 'send', device }))
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
{#if fingerprint && peerScreen}
  <div class="stack gap-xs placement">
    <PlacementMap {device} {peerScreen} {placement} height={220} />
    <p class="hint">Arraste para posicionar.</p>
  </div>
{/if}
<button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Parar</button>
