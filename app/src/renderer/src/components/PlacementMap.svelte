<script lang="ts">
  import { onMount } from 'svelte'
  import type { DeviceKind } from '../../../shared/device'
  import type { ExtendSide, ScreenPlacement, ScreenSize } from '../../../shared/types'
  import { patchSettings } from '../lib/actions'
  import { safeName } from '../lib/copy'
  import ScreenMap from './ScreenMap.svelte'

  interface Props {
    device: string
    /** O aparelho, pela impressão digital do certificado: é por ela que a posição fica guardada. */
    fingerprint: string
    peerScreen: ScreenSize
    placements: Record<string, ScreenPlacement>
    /** Lado de quem ainda não tem posição guardada. */
    fallback: ExtendSide
    height?: number
  }

  let { device, fingerprint, peerScreen, placements, fallback, height = 240 }: Props = $props()

  let own = $state<ScreenSize | null>(null)
  let ownKind = $state<DeviceKind>('desktop')
  onMount(() => {
    void window.horizonte.ownScreen().then((size) => (own = size))
    void window.horizonte.deviceKind().then((kind) => (ownKind = kind))
  })

  const name = $derived(safeName(device))
  const placement = $derived<ScreenPlacement>(placements[fingerprint] ?? { side: fallback })
  const hosts = $derived([{ name: device, address: fingerprint, screen: peerScreen }])

  function place(
    _name: string,
    where: { side: ScreenPlacement['side']; offset: number } | null
  ): void {
    // Sem a faixa de deixar de fora, o mapa sempre devolve um lado; null só por garantia.
    if (!where) return
    void patchSettings({ screenPlacements: { ...placements, [fingerprint]: where } })
  }
</script>

{#if own}
  <ScreenMap
    {own}
    {ownKind}
    {hosts}
    sides={{ [name]: placement.side }}
    offsets={placement.offset === undefined ? {} : { [name]: placement.offset }}
    onPlace={place}
    dock={false}
    {height}
  />
{/if}
