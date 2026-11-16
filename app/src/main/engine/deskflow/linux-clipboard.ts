/**
 * GNOME: copiar e colar entre os PCs pela área de transferência do próprio Mutter, sem aviso de permissão (o portal
 * só entrega o aviso de cópia ao Deskflow a partir do GNOME 51, e o modo Mouse próprio nem usa o Deskflow).
 *
 * Saída, uma linha JSON por cópia feita aqui: {"text": ...}, {"files": [caminhos]} ou, para uma imagem copiada,
 * {"files": [arquivo .png], "image": true} (a imagem vai para um arquivo na pasta do argv[3]).
 * Entrada, uma linha JSON no mesmo formato: põe isso na área de transferência daqui, pronto para colar.
 * Sai sozinho quando o Horizonte fecha (stdin).
 */
export const LINUX_CLIPBOARD_SCRIPT = String.raw`
import os, sys, json, select, gi, urllib.parse, pathlib, itertools
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
RD = 'org.gnome.Mutter.RemoteDesktop'
S = RD + '.Session'
TEXT = ['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain']
FILES = ['x-special/gnome-copied-files', 'text/uri-list']
IMAGE = 'image/png'
LIMIT, IMAGE_LIMIT, INBOX = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
os.makedirs(INBOX, mode=0o700, exist_ok=True)
count = itertools.count(1)
state = {'text': None, 'offered': {}}

def call(path, iface, method, args=None, rtype=None, fds=None):
    return bus.call_with_unix_fd_list_sync(RD, path, iface, method, args, rtype, 0, 5000, fds, None)

session = call('/org/gnome/Mutter/RemoteDesktop', RD, 'CreateSession', None, GLib.VariantType('(o)'))[0].unpack()[0]
call(session, S, 'EnableClipboard', GLib.Variant('(a{sv})', ({},)))
call(session, S, 'Start')

def emit(message):
    print(json.dumps(message), flush=True)

def read(mime, limit):
    res, fds = call(session, S, 'SelectionRead', GLib.Variant('(s)', (mime,)), GLib.VariantType('(h)'))
    fd = fds.get(res.unpack()[0])
    data = b''
    try:
        while len(data) <= limit:
            ready, _, _ = select.select([fd], [], [], 3)
            if not ready: break
            chunk = os.read(fd, 1 << 20)
            if not chunk: break
            data += chunk
    finally:
        os.close(fd)
    return data if len(data) <= limit else None

def paths_of(data):
    lines = data.decode('utf-8', 'replace').replace('\r', '').split('\n')
    uris = [l for l in lines if l.startswith('file://')]
    return [urllib.parse.unquote(urllib.parse.urlparse(u).path) for u in uris]

def copied(mimes):
    try:
        files = next((m for m in FILES if m in mimes), None)
        if files:
            data = read(files, LIMIT * 4)
            paths = paths_of(data or b'')
            if paths: return emit({'files': paths})
        if IMAGE in mimes:
            data = read(IMAGE, IMAGE_LIMIT)
            if data:
                path = os.path.join(INBOX, 'imagem-%d.png' % next(count))
                with open(path, 'wb') as out: out.write(data)
                return emit({'files': [path], 'image': True})
        text = next((m for m in TEXT if m in mimes), None)
        if text:
            data = read(text, LIMIT * 4)
            value = (data or b'').decode('utf-8', 'replace')
            # O mesmo texto que acabou de vir do outro PC não volta para ele.
            if value and len(value) <= LIMIT and value != state['text']:
                state['text'] = value
                emit({'text': value})
    except Exception as error:
        print(error, file=sys.stderr, flush=True)

def changed(conn, sender, path, iface, signal, params):
    opts = params.unpack()[0]
    if opts.get('session-is-owner'): return
    # Vem como uma tupla com a lista dentro: (['text/plain', ...],)
    mimes = opts.get('mime-types') or ([],)
    mimes = mimes[0] if isinstance(mimes, tuple) else mimes
    # Ler dentro do próprio aviso trava: o Mutter ainda está trocando de dono.
    if mimes: GLib.timeout_add(50, lambda: (copied(mimes), False)[1])

def transfer(conn, sender, path, iface, signal, params):
    mime, serial = params.unpack()
    data = state['offered'].get(mime)
    try:
        if data is None: raise KeyError(mime)
        res, fds = call(session, S, 'SelectionWrite', GLib.Variant('(u)', (serial,)), GLib.VariantType('(h)'))
        fd = fds.get(res.unpack()[0])
        os.set_blocking(fd, True)
        try:
            view = memoryview(data)
            while view: view = view[os.write(fd, view):]
        finally:
            os.close(fd)
        call(session, S, 'SelectionWriteDone', GLib.Variant('(ub)', (serial, True)))
    except Exception as error:
        print(error, file=sys.stderr, flush=True)
        call(session, S, 'SelectionWriteDone', GLib.Variant('(ub)', (serial, False)))

def place(message):
    if 'text' in message:
        value = message['text']
        if value == state['text']: return
        state['text'] = value
        raw = value.encode('utf-8')
        offered = {m: raw for m in TEXT}
    elif message.get('image'):
        with open(message['files'][0], 'rb') as f: offered = {IMAGE: f.read()}
    else:
        uris = [pathlib.Path(p).as_uri() for p in message['files']]
        offered = {
            'x-special/gnome-copied-files': ('copy\n' + '\n'.join(uris)).encode(),
            'text/uri-list': ('\r\n'.join(uris) + '\r\n').encode(),
            'text/plain;charset=utf-8': '\n'.join(message['files']).encode(),
        }
    state['offered'] = offered
    call(session, S, 'SetSelection', GLib.Variant('(a{sv})', ({'mime-types': GLib.Variant('as', list(offered))},)))

bus.signal_subscribe(RD, S, 'SelectionOwnerChanged', session, None, 0, changed)
bus.signal_subscribe(RD, S, 'SelectionTransfer', session, None, 0, transfer)
loop = GLib.MainLoop()
pending = [b'']

def stdin(*_):
    chunk = os.read(0, 1 << 16)
    if not chunk:
        loop.quit()
        return False
    pending[0] += chunk
    *lines, pending[0] = pending[0].split(b'\n')
    for line in lines:
        try:
            if line.strip(): place(json.loads(line))
        except Exception as error:
            print(error, file=sys.stderr, flush=True)
    return True

GLib.io_add_watch(GLib.IOChannel.unix_new(0), GLib.PRIORITY_DEFAULT, GLib.IO_IN | GLib.IO_HUP, stdin)
loop.run()
`
