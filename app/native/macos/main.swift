import Cocoa

// horizonte-display: cria um monitor virtual no macOS e fica vivo até receber SIGTERM ou SIGINT.
// O monitor some junto com o processo. Imprime "DISPLAY_ID <número>" quando a tela está pronta.
//
// Uso: horizonte-display [--width 1920] [--height 1080] [--name Horizonte]
//      horizonte-display --count   (só imprime quantas telas o macOS está usando agora e sai)
//      horizonte-display --layout  (JSON com a tela principal e os limites reais das telas ativas)

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
    guard ["--width", "--height", "--name"].contains(option) else {
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
descriptor.serialNum = 0x0001
descriptor.terminationHandler = { _, _ in
    fputs("o macOS encerrou o monitor virtual\n", stderr)
    exit(3)
}

guard let display = CGVirtualDisplay(descriptor: descriptor) else {
    fputs("o macOS recusou criar o monitor virtual\n", stderr)
    exit(2)
}

let settings = CGVirtualDisplaySettings()
settings.hiDPI = 0 // um pixel para um pixel: é o que o Sunshine captura
settings.modes = [CGVirtualDisplayMode(width: UInt(width), height: UInt(height), refreshRate: 60)]
guard display.apply(settings) else {
    fputs("o macOS recusou as configurações do monitor virtual\n", stderr)
    exit(2)
}

// Coloca o monitor novo à direita do principal, como uma segunda tela de verdade.
let mainBounds = CGDisplayBounds(CGMainDisplayID())
guard let x = Int32(exactly: mainBounds.maxX), let y = Int32(exactly: mainBounds.minY) else {
    fail("coordenadas do monitor principal fora do intervalo do Quartz")
}
var configuration: CGDisplayConfigRef?
let beginError = CGBeginDisplayConfiguration(&configuration)
guard beginError == .success, let config = configuration else {
    fail("nao consegui iniciar o posicionamento do monitor virtual: Quartz \(beginError.rawValue)")
}
let originError = CGConfigureDisplayOrigin(config, display.displayID, x, y)
guard originError == .success else {
    let cancelError = CGCancelDisplayConfiguration(config)
    if cancelError != .success {
        fputs("nao consegui cancelar o posicionamento: Quartz \(cancelError.rawValue)\n", stderr)
    }
    fail("nao consegui posicionar o monitor virtual: Quartz \(originError.rawValue)")
}
// Complete consome a referencia da transacao, inclusive quando devolve erro.
let completeError = CGCompleteDisplayConfiguration(config, .forSession)
guard completeError == .success else {
    fail("nao consegui aplicar o posicionamento do monitor virtual: Quartz \(completeError.rawValue)")
}
let positioned = CGDisplayBounds(display.displayID)
guard positioned.minX == mainBounds.maxX, positioned.minY == mainBounds.minY else {
    fail("o macOS nao posicionou o monitor virtual a direita do principal")
}

print("DISPLAY_ID \(display.displayID)")
fflush(stdout)

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
