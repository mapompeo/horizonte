/**
 * GNOME: o Deskflow só leva o texto copiado no Linux para o outro PC a partir do GNOME 51 (o portal não entrega
 * o aviso de cópia a ele). Este observador abre uma sessão própria no Mutter, sem aviso de permissão, e imprime
 * cada texto copiado como uma linha JSON {"text": ...}. Sai sozinho quando o Horizonte fecha (stdin).
 */
export const LINUX_TEXT_SCRIPT = String.raw`
import os, sys, json, select, gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
RD = 'org.gnome.Mutter.RemoteDesktop'
S = RD + '.Session'
TEXT = ['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain']
LIMIT = int(sys.argv[1])

def call(path, iface, method, args=None, rtype=None):
    return bus.call_with_unix_fd_list_sync(RD, path, iface, method, args, rtype, 0, 5000, None, None)

session = call('/org/gnome/Mutter/RemoteDesktop', RD, 'CreateSession', None, GLib.VariantType('(o)'))[0].unpack()[0]
call(session, S, 'EnableClipboard', GLib.Variant('(a{sv})', ({},)))
call(session, S, 'Start')

def read(mime):
    try:
        res, fds = call(session, S, 'SelectionRead', GLib.Variant('(s)', (mime,)), GLib.VariantType('(h)'))
        fd = fds.get(res.unpack()[0])
        data = b''
        while len(data) <= LIMIT * 4:
            ready, _, _ = select.select([fd], [], [], 3)
            if not ready: break
            chunk = os.read(fd, 65536)
            if not chunk: break
            data += chunk
        os.close(fd)
        text = data.decode('utf-8', 'replace')
        if text and len(text) <= LIMIT: print(json.dumps({'text': text}), flush=True)
    except Exception as error:
        print(error, file=sys.stderr, flush=True)

def changed(conn, sender, path, iface, signal, params):
    opts = params.unpack()[0]
    if opts.get('session-is-owner'): return
    # Vem como uma tupla com a lista dentro: (['text/plain', ...],)
    mimes = opts.get('mime-types') or ([],)
    mimes = mimes[0] if isinstance(mimes, tuple) else mimes
    mime = next((m for m in TEXT if m in mimes), None)
    # Ler dentro do próprio aviso trava: o Mutter ainda está trocando de dono.
    if mime: GLib.timeout_add(50, lambda: (read(mime), False)[1])

bus.signal_subscribe(RD, S, 'SelectionOwnerChanged', session, None, 0, changed)
loop = GLib.MainLoop()
GLib.io_add_watch(GLib.IOChannel.unix_new(0), GLib.PRIORITY_DEFAULT, GLib.IO_IN | GLib.IO_HUP, lambda *_: (loop.quit(), False)[1])
loop.run()
`
