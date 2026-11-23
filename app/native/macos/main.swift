import Cocoa

// horizonte-display: cria um monitor virtual no macOS e fica vivo até receber SIGTERM ou SIGINT.
// O monitor some junto com o processo. Imprime "DISPLAY_ID <número>" quando a tela está pronta.
//
// Uso: horizonte-display [--width 1920] [--height 1080] [--name Horizonte]
//      horizonte-display --count   (só imprime quantas telas o macOS está usando agora e sai)
//      horizonte-display --layout  (JSON com a tela principal e os limites reais das telas ativas)
// Depois de pronto, aceita pela entrada padrão "place <lado> [início]" e "at <x> <y>" para mudar de lugar.

func fail(_ message: String, code: Int32 = 2) -> Never {
    fputs("\(message)\n", stderr)
    exit(code)
}

let args = Array(CommandLine.arguments.dropFirst())

// Consultas somente de leitura: coordenadas globais do Quartz, sem converter para pixels ou AppKit.
struct DisplayBounds: Codable {
    let id: CGDirectDisplayID
    let x: Double
    let y: Double
    let width: Double
    let height: Double

    init(_ id: CGDirectDisplayID) {
        let bounds = CGDisplayBounds(id)
        self.id = id
        x = Double(bounds.minX)
        y = Double(bounds.minY)
        width = Double(bounds.width)
        height = Double(bounds.height)
    }
}

struct Layout: Codable {
    let main: CGDirectDisplayID
    let displays: [DisplayBounds]
}

if args.contains("--count") || args.contains("--layout") {
    guard args.count == 1 else {
        fail("--count e --layout devem ser usados sozinhos", code: 64)
    }
    var count: UInt32 = 0
    let countError = CGGetActiveDisplayList(0, nil, &count)
    guard countError == .success else {
        fail("nao consegui contar as telas: Quartz \(countError.rawValue)")
    }
    if args[0] == "--count" {
        print(count)
        exit(0)
    }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    let listError = CGGetActiveDisplayList(count, &ids, &count)
    guard listError == .success else {
        fail("nao consegui listar as telas: Quartz \(listError.rawValue)")
    }
    let layout = Layout(main: CGMainDisplayID(), displays: ids.prefix(Int(count)).map { DisplayBounds($0) })
    do {
        let json = try JSONEncoder().encode(layout)
        print(String(decoding: json, as: UTF8.self))
        exit(0)
    } catch {
        fail("nao consegui serializar o layout: \(error)")
    }
}

var options: [String: String] = [:]
var index = 0
while index < args.count {
    let option = args[index]
    guard ["--width", "--height", "--name", "--serial"].contains(option) else {
        fail("argumento desconhecido: \(option)", code: 64)
    }
    guard index + 1 < args.count, !args[index + 1].hasPrefix("--"), !args[index + 1].isEmpty else {
        fail("valor ausente para \(option)", code: 64)
    }
    guard options[option] == nil else {
        fail("argumento repetido: \(option)", code: 64)
    }
    options[option] = args[index + 1]
    index += 2
}

guard let width = Int(options["--width"] ?? "1920"),
      let height = Int(options["--height"] ?? "1080") else {
    fail("--width e --height exigem numeros inteiros", code: 64)
}
let name = options["--name"] ?? "Horizonte"
guard width >= 640, width <= 7680, height >= 480, height <= 4320 else {
    fail("tamanho invalido: \(width)x\(height)", code: 64)
}

let descriptor = CGVirtualDisplayDescriptor()
descriptor.setDispatchQueue(DispatchQueue.main)
descriptor.name = name
descriptor.maxPixelsWide = UInt32(width)
descriptor.maxPixelsHigh = UInt32(height)
// Tamanho físico de uma tela de cerca de 24 polegadas: o macOS usa isso para decidir a densidade.
descriptor.sizeInMillimeters = CGSize(width: 527, height: 296)
descriptor.vendorID = 0x4852
descriptor.productID = 0x4821
// Uma tela por aparelho conectado: cada uma com o seu número de série (o macOS não aceita duas iguais).
descriptor.serialNum = UInt32(options["--serial"] ?? "1") ?? 1
descriptor.terminationHandler = { _, _ in
    fputs("o macOS encerrou o monitor virtual\n", stderr)
    exit(3)
}

guard let display = CGVirtualDisplay(descriptor: descriptor) else {
    fputs("o macOS recusou criar o monitor virtual\n", stderr)
    exit(2)
}

let settings = CGVirtualDisplaySettings()
settings.hiDPI = 0 // um pixel para um pixel: é o que o motor transmite
settings.modes = [CGVirtualDisplayMode(width: UInt(width), height: UInt(height), refreshRate: 60)]
guard display.apply(settings) else {
    fputs("o macOS recusou as configurações do monitor virtual\n", stderr)
    exit(2)
}

// Coloca o monitor novo à direita das telas que já existem (com outra tela virtual ligada, depois dela), alinhado
// em cima com a principal. O motor reposiciona depois, conforme o mapa dos Ajustes.
let mainBounds = CGDisplayBounds(CGMainDisplayID())

/// Uma tentativa de pôr o monitor à direita de tudo. Devolve nil se deu certo, ou o motivo de não ter dado.
func placeAtRight() -> String? {
    var total: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &total)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(total))
    CGGetActiveDisplayList(total, &ids, &total)
    let rightEdge = ids.prefix(Int(total)).filter { $0 != display.displayID }
        .map { CGDisplayBounds($0).maxX }.max() ?? mainBounds.maxX
    guard let x = Int32(exactly: rightEdge), let y = Int32(exactly: mainBounds.minY) else {
        return "coordenadas do monitor principal fora do intervalo do Quartz"
    }
    var configuration: CGDisplayConfigRef?
    let beginError = CGBeginDisplayConfiguration(&configuration)
    guard beginError == .success, let config = configuration else {
        return "nao consegui iniciar o posicionamento do monitor virtual: Quartz \(beginError.rawValue)"
    }
    let originError = CGConfigureDisplayOrigin(config, display.displayID, x, y)
    guard originError == .success else {
        _ = CGCancelDisplayConfiguration(config)
        return "nao consegui posicionar o monitor virtual: Quartz \(originError.rawValue)"
    }
    // Complete consome a referencia da transacao, inclusive quando devolve erro.
    let completeError = CGCompleteDisplayConfiguration(config, .forSession)
    guard completeError == .success else {
        return "nao consegui aplicar o posicionamento do monitor virtual: Quartz \(completeError.rawValue)"
    }
    let positioned = CGDisplayBounds(display.displayID)
    guard positioned.minX == rightEdge, positioned.minY == mainBounds.minY else {
        return "o macOS nao posicionou o monitor virtual a direita das outras telas"
    }
    return nil
}

// Dois auxiliares ligando juntos disputam o "à direita de tudo": quem perde tenta de novo, com a lista de telas já
// atualizada, antes de desistir.
var placementError = placeAtRight()
var attempt = 1
while placementError != nil && attempt < 6 {
    usleep(300_000)
    placementError = placeAtRight()
    attempt += 1
}
if let message = placementError { fail(message) }

print("DISPLAY_ID \(display.displayID)")
fflush(stdout)

// Posição pedida pelo app, uma linha por pedido na entrada padrão: "place <left|right|above|below> [início]" (sem
// início: centralizada na borda) ou "at <x> <y>" (posição livre do mapa, em frações das telas de verdade). Responde
// "PLACED <o que foi>" quando aplicou. Mesmas regras do auxiliar do Linux: a tela fica encostada nas de verdade, sem
// ficar por cima de outra tela do Horizonte, e nenhuma tela do Horizonte fica solta no ar.
struct Box {
    var x: Double
    var y: Double
    var w: Double
    var h: Double
    var maxX: Double { x + w }
    var maxY: Double { y + h }
    init(_ rect: CGRect) {
        x = Double(rect.minX)
        y = Double(rect.minY)
        w = Double(rect.width)
        h = Double(rect.height)
    }
}

func overlaps(_ a: Box, _ b: Box) -> Bool {
    a.x < b.maxX && b.x < a.maxX && a.y < b.maxY && b.y < a.maxY
}

/// Duas telas se encostam quando dividem um pedaço de borda (só o canto não vale).
func touches(_ a: Box, _ b: Box) -> Bool {
    let shareY = min(a.maxY, b.maxY) - max(a.y, b.y) > 0
    let shareX = min(a.maxX, b.maxX) - max(a.x, b.x) > 0
    return ((a.maxX == b.x || b.maxX == a.x) && shareY) || ((a.maxY == b.y || b.maxY == a.y) && shareX)
}

/// Posição livre: a mais perto da pedida, encostada na borda de alguma tela e sem ficar por cima de nenhuma.
func snapFree(_ want: Box, against others: [Box]) -> Box {
    var best = want
    var bestDistance = Double.infinity
    for o in others {
        let minX = min(want.w, o.w) / 10
        let minY = min(want.h, o.h) / 10
        let sx = min(max(want.x, o.x - want.w + minX), o.maxX - minX)
        let sy = min(max(want.y, o.y - want.h + minY), o.maxY - minY)
        let candidates: [(Double, Double)] = [(o.x - want.w, sy), (o.maxX, sy), (sx, o.y - want.h), (sx, o.maxY)]
        for (cx, cy) in candidates {
            var t = want
            t.x = cx
            t.y = cy
            if others.contains(where: { overlaps(t, $0) }) { continue }
            let distance = hypot(t.x - want.x, t.y - want.y)
            if distance < bestDistance {
                bestDistance = distance
                best = t
            }
        }
    }
    return best
}

func activeDisplayIds() -> [CGDirectDisplayID] {
    var total: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &total)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(total))
    CGGetActiveDisplayList(total, &ids, &total)
    return Array(ids.prefix(Int(total)))
}

/// Calcula e aplica a posição desta tela (e leva para a direita de tudo a tela de outro aparelho que ficou solta).
func reposition(side: String, start: Double?, free: (Double, Double)?) -> Bool {
    var physical: [Box] = []
    var siblings: [(CGDirectDisplayID, Box)] = []
    for id in activeDisplayIds() where id != display.displayID {
        let box = Box(CGDisplayBounds(id))
        // As telas do próprio Horizonte (de outros aparelhos) têm o código de fabricante do auxiliar.
        if CGDisplayVendorNumber(id) == 0x4852 { siblings.append((id, box)) } else { physical.append(box) }
    }
    let base = physical.isEmpty ? siblings.map { $0.1 } : physical
    guard !base.isEmpty else { return false }
    let left = base.map { $0.x }.min() ?? 0
    let top = base.map { $0.y }.min() ?? 0
    let right = base.map { $0.maxX }.max() ?? 0
    let bottom = base.map { $0.maxY }.max() ?? 0
    var box = Box(CGDisplayBounds(display.displayID))
    let all = base + siblings.map { $0.1 }

    if let target = free {
        let (fx, fy) = target
        box.x = (left + fx * (right - left)).rounded()
        box.y = (top + fy * (bottom - top)).rounded()
        box = snapFree(box, against: all)
    } else {
        let alongX = side == "above" || side == "below"
        let edge = alongX ? right - left : bottom - top
        let peer = alongX ? box.w : box.h
        let at = start.map { $0 * edge } ?? (edge - peer) / 2
        switch side {
        case "left": box.x = left - box.w; box.y = top + at
        case "right": box.x = right; box.y = top + at
        case "above": box.x = left + at; box.y = top - box.h
        default: box.x = left + at; box.y = bottom
        }
        // Outro aparelho já deste lado: esta tela vai para fora dele, sem ficar por cima.
        for _ in 0..<8 {
            var moved = false
            for (_, other) in siblings where overlaps(box, other) {
                switch side {
                case "left": box.x = other.x - box.w
                case "right": box.x = other.maxX
                case "above": box.y = other.y - box.h
                default: box.y = other.maxY
                }
                moved = true
            }
            if !moved { break }
        }
    }

    // Tela de outro aparelho que só se encostava onde esta estava: vai para a direita de tudo, e o auxiliar dela a
    // devolve ao lugar dela logo depois.
    var moves: [(CGDirectDisplayID, Int32, Int32)] = []
    guard let mx = Int32(exactly: box.x.rounded()), let my = Int32(exactly: box.y.rounded()) else { return false }
    moves.append((display.displayID, mx, my))
    let others = [box] + base
    for (id, other) in siblings where !others.contains(where: { touches(other, $0) }) {
        let edgeX = (others.map { $0.maxX }.max() ?? 0)
        if let ox = Int32(exactly: edgeX), let oy = Int32(exactly: other.y) { moves.append((id, ox, oy)) }
    }

    var configuration: CGDisplayConfigRef?
    guard CGBeginDisplayConfiguration(&configuration) == .success, let config = configuration else { return false }
    for (id, x, y) in moves {
        guard CGConfigureDisplayOrigin(config, id, x, y) == .success else {
            _ = CGCancelDisplayConfiguration(config)
            return false
        }
    }
    // Complete consome a referência da transação, inclusive quando devolve erro.
    return CGCompleteDisplayConfiguration(config, .forSession) == .success
}

func handlePlacement(_ line: String) {
    let parts = line.split(separator: " ").map(String.init)
    guard let verb = parts.first else { return }
    if verb == "at", parts.count == 3, let fx = Double(parts[1]), let fy = Double(parts[2]), abs(fx) <= 8, abs(fy) <= 8 {
        if reposition(side: "at", start: nil, free: (fx, fy)) {
            print("PLACED at")
            fflush(stdout)
        } else {
            fputs("nao consegui posicionar a tela estendida\n", stderr)
        }
    } else if verb == "place", parts.count >= 2, ["left", "right", "above", "below"].contains(parts[1]) {
        var start: Double?
        if parts.count > 2 {
            guard let value = Double(parts[2]), abs(value) <= 4 else {
                fputs("pedido de posicao invalido\n", stderr)
                return
            }
            start = value
        }
        if reposition(side: parts[1], start: start, free: nil) {
            print("PLACED \(parts[1])")
            fflush(stdout)
        } else {
            fputs("nao consegui posicionar a tela estendida\n", stderr)
        }
    } else {
        fputs("pedido de posicao invalido\n", stderr)
    }
}

var pendingInput = ""
FileHandle.standardInput.readabilityHandler = { handle in
    let data = handle.availableData
    // Entrada fechada: o app saiu e a tela não tem mais dono (o vigia abaixo também cuida disso).
    if data.isEmpty {
        handle.readabilityHandler = nil
        return
    }
    pendingInput += String(decoding: data, as: UTF8.self)
    while let newline = pendingInput.firstIndex(of: "\n") {
        let line = String(pendingInput[..<newline])
        pendingInput.removeSubrange(...newline)
        DispatchQueue.main.async { handlePlacement(line) }
    }
}

// Se o app que me iniciou morrer, o processo passa a ter outro pai: aí o monitor virtual não tem mais dono.
let originalParent = getppid()
let watcher = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    if getppid() != originalParent { exit(0) }
}
watcher.tolerance = 0.5

var signalSources: [DispatchSourceSignal] = []
for signalNumber in [SIGTERM, SIGINT] {
    signal(signalNumber, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
    source.setEventHandler { exit(0) }
    source.resume()
    // O sistema guarda a fonte enquanto ela existir: precisa continuar viva até o fim do programa.
    signalSources.append(source)
}

RunLoop.main.run()
