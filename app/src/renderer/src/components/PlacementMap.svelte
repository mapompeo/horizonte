<script lang="ts">
  import { onMount } from 'svelte'
  import type { LinkQuality, ScreenPlacement, ScreenSize } from '../../../shared/types'
  import { patchSettings } from '../lib/actions'
  import FreeScreenMap from './FreeScreenMap.svelte'

  /** Uma tela no mapa: `key` é a impressão digital do aparelho, ou `*` para a posição padrão. */
  export interface MapScreen {
    key: string
    name: string
    screen: ScreenSize
    placement: ScreenPlacement
    quality?: LinkQuality
  }

  interface Props {
    screens: MapScreen[]
    /** As posições guardadas de cada aparelho (para juntar a nova às outras). */
    placements: Record<string, ScreenPlacement>
    height?: number
    /** Com ele, cada tela no mapa tem um ✕ para parar. */
    onStop?: (key: string) => void
  }

  let { screens, placements, height = 240, onStop }: Props = $props()

  /** Este computador em pontos (a área de trabalho dividida pela escala da tela). */
  let own = $state<ScreenSize | null>(null)
  let ownPixels = $state<ScreenSize | null>(null)
  onMount(() => {
    void window.horizonte.ownScreen().then((size) => {
      const ratio = window.devicePixelRatio || 1
      ownPixels = size
      own = { width: size.width / ratio, height: size.height / ratio }
    })
  })
  const resolution = (size: ScreenSize): string =>
    `${Math.round(size.width)} × ${Math.round(size.height)}`

  /**
   * A tela estendida em pontos, com a mesma conta do motor (web/main.ts, screenScale): escala do aparelho, sem deixar o
   * lado menor abaixo de 720 pontos. A densidade não vem junto: monitor e notebook comuns valem 1 (2 nos de altíssima
   * resolução); celular e tablet, 2.
   */
  function points(size: ScreenSize): ScreenSize {
    const min = Math.min(size.width, size.height)
    const max = Math.max(size.width, size.height)
    const density = max / min < 1.9 && max >= 1280 ? (min >= 1800 ? 2 : 1) : 2
    const scale = Math.max(1, Math.min(density, min / 720))
    return { width: size.width / scale, height: size.height / scale }
  }

  const free = $derived(
    screens.map((s) => ({
      key: s.key,
      name: s.name,
      size: points(s.screen),
      placement: s.placement,
      detail: resolution(s.screen),
      quality: s.quality
    }))
  )

  function place(key: string, placement: ScreenPlacement): void {
    void patchSettings(
      key === '*'
        ? { screenPlacement: placement }
        : { screenPlacements: { ...placements, [key]: placement } }
    )
  }
</script>

{#if own}
  <FreeScreenMap
    {own}
    screens={free}
    onPlace={place}
    {onStop}
    ownDetail={ownPixels ? resolution(ownPixels) : undefined}
    {height}
  />
{/if}
