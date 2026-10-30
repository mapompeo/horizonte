<script lang="ts">
  import { copyFor } from '../lib/copy'
  import { patchSettings, send } from '../lib/actions'
  import Pill from '../components/Pill.svelte'
  import PlacementMap from '../components/PlacementMap.svelte'
  import Stepper from '../components/Stepper.svelte'
  import type { ExtendSide, ScreenPlacement, ScreenSize } from '../../../shared/types'

  interface Props {
    device: string
    bitrate: number
    /** Motor próprio: quem está mostrando e o tamanho da tela dele (sem isso, não há mapa). */
    fingerprint?: string
    peerScreen?: ScreenSize
    placements: Record<string, ScreenPlacement>
    extendSide: ExtendSide
  }

  let { device, bitrate, fingerprint, peerScreen, placements, extendSide }: Props = $props()

  const copy = $derived(copyFor({ screen: 'connected', mode: 'send', device }))
</script>

<div class="stack gap-sm">
  {#if copy.pill}<Pill tone={copy.pill.tone}>{copy.pill.text}</Pill>{/if}
  <h1 class="title">{copy.title}</h1>
</div>
{#if fingerprint && peerScreen}
  <div class="stack gap-xs">
    <PlacementMap
      {device}
      {fingerprint}
      {peerScreen}
      {placements}
      fallback={extendSide}
      height={220}
    />
    <p class="hint-faint">Arraste a tela para onde ela fica na sua mesa. Muda na hora.</p>
  </div>
{/if}
<div class="stack gap-md">
  <Stepper {bitrate} onChange={(mbps) => patchSettings({ bitrate: mbps })} />
  <button class="btn btn-outline" onclick={() => send({ type: 'STOP' })}>Parar</button>
</div>
