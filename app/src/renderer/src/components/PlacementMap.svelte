<script lang="ts">
  import { onMount } from 'svelte'
  import type { DeviceKind } from '../../../shared/device'
  import type { ScreenPlacement, ScreenSize } from '../../../shared/types'
  import { patchSettings } from '../lib/actions'
  import { safeName } from '../lib/copy'
  import ScreenMap from './ScreenMap.svelte'

  /** Uma tela no mapa: `key` é a impressão digital do aparelho, ou `*` para a posição padrão. */
  export interface MapScreen {
    key: string
    name: string
    screen: ScreenSize
    placement: ScreenPlacement
  }

  interface Props {
    screens: MapScreen[]
    /** As posições guardadas de cada aparelho (para juntar a nova às outras). */
    placements: Record<string, ScreenPlacement>
    height?: number
  }

  let { screens, placements, height = 240 }: Props = $props()

  let own = $state<ScreenSize | null>(null)
  let ownKind = $state<DeviceKind>('desktop')
  onMount(() => {
    void window.horizonte.ownScreen().then((size) => (own = size))
    void window.horizonte.deviceKind().then((kind) => (ownKind = kind))
  })

  const hosts = $derived(screens.map((s) => ({ name: s.name, address: s.key, screen: s.screen })))
  const sides = $derived(
    Object.fromEntries(screens.map((s) => [safeName(s.name), s.placement.side]))
  )
  const offsets = $derived(
    Object.fromEntries(
      screens.flatMap((s) =>
        s.placement.offset === undefined ? [] : [[safeName(s.name), s.placement.offset]]
      )
    )
  )

  function place(
    name: string,
    where: { side: ScreenPlacement['side']; offset: number } | null
  ): void {
    // Sem a faixa de deixar de fora, o mapa sempre devolve um lado; null só por garantia.
    const moved = screens.find((s) => safeName(s.name) === name)
    if (!where || !moved) return
    void patchSettings(
      moved.key === '*'
        ? { screenPlacement: where }
        : { screenPlacements: { ...placements, [moved.key]: where } }
    )
  }
</script>

{#if own}
  <ScreenMap {own} {ownKind} {hosts} {sides} {offsets} onPlace={place} dock={false} {height} />
{/if}
