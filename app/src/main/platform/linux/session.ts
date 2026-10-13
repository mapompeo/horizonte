export type SessionKind = 'x11' | 'wayland' | 'unknown'

/** O monitor virtual (xrandr) só existe em Xorg; no Wayland o Horizonte espelha a tela principal. */
export function sessionKind(env: Record<string, string | undefined>): SessionKind {
  const type = (env.XDG_SESSION_TYPE ?? '').toLowerCase()
  if (type === 'x11') return 'x11'
  if (type === 'wayland') return 'wayland'
  return env.WAYLAND_DISPLAY ? 'wayland' : env.DISPLAY ? 'x11' : 'unknown'
}
