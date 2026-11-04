<script lang="ts">
  import { onMount } from 'svelte'
  import type { DeviceKind } from '../../../shared/device'
  import type { ScreenPlacement, ScreenSize } from '../../../shared/types'
  import { patchSettings } from '../lib/actions'
  import { safeName } from '../lib/copy'
  import ScreenMap from './ScreenMap.svelte'

  interface Props {
    /** Nome no retângulo da outra tela. */
    device: string
    peerScreen: ScreenSize
    /** A posição da tela estendida, a mesma para todos os aparelhos. */
    placement: ScreenPlacement
    height?: number
  }

  let { device, peerScreen, placement, height = 240 }: Props = $props()

  let own = $state<ScreenSize | null>(null)
  let ownKind = $state<DeviceKind>('desktop')
  onMount(() => {
    void window.horizonte.ownScreen().then((size) => (own = size))
    void window.horizonte.deviceKind().then((kind) => (ownKind = kind))
  })

  const name = $derived(safeName(device))
  const hosts = $derived([{ name: device, address: 'tela-estendida', screen: peerScreen }])

  function place(
    _name: string,
    where: { side: ScreenPlacement['side']; offset: number } | null
  ): void {
    // Sem a faixa de deixar de fora, o mapa sempre devolve um lado; null só por garantia.
    if (!where) return
    void patchSettings({ screenPlacement: where })
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
