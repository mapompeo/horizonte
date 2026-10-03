export type SessionKind = 'x11' | 'wayland' | 'unknown'

/** O monitor virtual só funciona em Xorg; no Wayland o Horizonte avisa e orienta, sem tentar contornar. */
export function sessionKind(env: Record<string, string | undefined>): SessionKind {
  const type = (env.XDG_SESSION_TYPE ?? '').toLowerCase()
  if (type === 'x11') return 'x11'
  if (type === 'wayland') return 'wayland'
  return env.WAYLAND_DISPLAY ? 'wayland' : env.DISPLAY ? 'x11' : 'unknown'
}

export const WAYLAND_MESSAGE =
  'Esta sessão usa Wayland, e o monitor virtual do Horizonte precisa do Xorg. Na tela de login, escolha "Ubuntu on Xorg" (pela engrenagem), entre de novo e abra o Horizonte.'
