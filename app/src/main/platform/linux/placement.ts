import { spawn } from 'node:child_process'
import type { ExtendSide } from '../../../shared/types'

/**
 * GNOME: o portal só cria o monitor virtual (Meta-N) quando o outro aparelho conecta. Este observador fica de
 * olho nas mudanças de monitores do Mutter e, a cada monitor virtual que aparece, põe ele no lado escolhido
 * (configuração temporária, sem o aviso "manter alterações"). Sai sozinho quando o Horizonte fecha (stdin).
 */
export const GNOME_PLACEMENT_SCRIPT = String.raw`
import sys, gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
side = sys.argv[1]
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
P = ('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig')
placed = set()

def place():
    serial, monitors, logical, _ = bus.call_sync(*P, 'GetCurrentState', None, None, 0, -1, None).unpack()
    modes = {}
    for spec, list_, _p in monitors:
        for m in list_:
            if m[6].get('is-current'): modes[spec[0]] = m
    virtual = [l for l in logical if any(s[0].startswith('Meta-') for s in l[5])]
    real = [l for l in logical if l not in virtual]
    names = {s[0] for l in virtual for s in l[5]}
    placed.intersection_update(names)
    fresh = [l for l in virtual if l[5][0][0] not in placed]
    if not fresh or not real: return
    v = fresh[0]
    size = lambda l: (int(modes[l[5][0][0]][1] / l[2]), int(modes[l[5][0][0]][2] / l[2]))
    vw, vh = size(v)
    left = min(l[0] for l in real); top = min(l[1] for l in real)
    right = max(l[0] + size(l)[0] for l in real)
    x, y = {'left': (left - vw, top), 'above': (left, top - vh)}.get(side, (right, top))
    placed.add(v[5][0][0])
    if (x, y) == (v[0], v[1]): return
    ox = min(x, left); oy = min(y, top)
    def lm(l, lx, ly): return (lx - ox, ly - oy, l[2], l[3], l[4], [(s[0], modes[s[0]][0], {}) for s in l[5]])
    config = [lm(l, l[0], l[1]) for l in logical if l is not v] + [lm(v, x, y)]
    bus.call_sync(*P, 'ApplyMonitorsConfig', GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', (serial, 1, config, {})), None, 0, -1, None)

def safe(*_):
    try: place()
    except Exception as error: print(error, file=sys.stderr, flush=True)

bus.signal_subscribe(P[0], P[2], 'MonitorsChanged', P[1], None, 0, safe)
loop = GLib.MainLoop()
GLib.io_add_watch(GLib.IOChannel.unix_new(0), GLib.PRIORITY_DEFAULT, GLib.IO_IN | GLib.IO_HUP, lambda *_: (loop.quit(), False)[1])
safe()
loop.run()
`

/** Um observador por vez: trocar o lado reinicia ele com o lado novo. Fora do GNOME não faz nada. */
export function createGnomePlacer(
  env: Record<string, string | undefined>
): (side: ExtendSide) => Promise<void> {
  let current: { kill(): void } | null = null
  return async (side) => {
    if (!/gnome/i.test(env.XDG_CURRENT_DESKTOP ?? '')) return
    current?.kill()
    const child = spawn('python3', ['-c', GNOME_PLACEMENT_SCRIPT, side], {
      stdio: ['pipe', 'ignore', 'ignore']
    })
    child.on('error', () => undefined)
    current = { kill: () => void child.kill() }
  }
}
