import type { MapScreen } from '../components/PlacementMap.svelte'
import { placeAll } from '../../../shared/placement'
import type { ConnectedDevice, LinkQuality, ScreenPlacement } from '../../../shared/types'

/**
 * As telas do mapa de posição: cada aparelho conectado, com o tamanho e a posição dele. A tela de conectados e os
 * Ajustes usam esta mesma conta, para os dois mapas mostrarem a mesma coisa.
 */
export function mapScreens(
  devices: ConnectedDevice[],
  placements: Record<string, ScreenPlacement>,
  placement: ScreenPlacement,
  links: Record<string, LinkQuality> = {}
): MapScreen[] {
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
    placement: at[i],
    quality: links[d.fingerprint as string]
  }))
}
