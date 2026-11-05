import type { MouseSide } from '../../../shared/types'
import type { VideoHint } from './video-driver'

/**
 * O Ubuntu Dock, oculto e com "exigir pressão para mostrar", põe uma barreira na borda da tela: o cursor só passa
 * empurrando. Com outra tela encostada nessa mesma borda, parece que o mouse trava ao passar para ela. Medido com o
 * mesmo ponteiro: 56 px além da borda do dock, nenhum na borda sem dock.
 */
export const DOCK_PRESSURE_COMMAND =
  'gsettings set org.gnome.shell.extensions.dash-to-dock require-pressure-to-show false'

export interface DockFacts {
  /** `dock-position`, como o gsettings responde: 'BOTTOM', por exemplo. */
  position: string
  autohide: string
  pressure: string
}

const SIDES: Record<string, MouseSide> = {
  BOTTOM: 'below',
  TOP: 'above',
  LEFT: 'left',
  RIGHT: 'right'
}

export function dockEdgeHint(facts: DockFacts, sides: MouseSide[]): VideoHint | null {
  if (facts.autohide.trim() !== 'true' || facts.pressure.trim() !== 'true') return null
  const edge = SIDES[facts.position.replace(/'/g, '').trim()]
  if (!edge || !sides.includes(edge)) return null
  return {
    message:
      'O dock segura o mouse nessa borda. Arraste a tela para outro lado ou desligue a pressão do dock:',
    command: DOCK_PRESSURE_COMMAND
  }
}
