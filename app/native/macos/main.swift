import Cocoa

// horizonte-display: cria um monitor virtual no macOS e fica vivo até receber SIGTERM ou SIGINT.
// O monitor some junto com o processo. Imprime "DISPLAY_ID <número>" quando a tela está pronta.
//
// Uso: horizonte-display [--width 1920] [--height 1080] [--name Horizonte]
//      horizonte-display --count   (só imprime quantas telas o macOS está usando agora e sai)

// Conta as telas em uso pela própria API do sistema. Funciona também sem placa de vídeo (máquina virtual),
// onde o system_profiler não lista nada.
if CommandLine.arguments.contains("--count") {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    print(count)
    exit(0)
}

func argument(_ name: String, default fallback: String) -> String {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else { return fallback }
    return args[index + 1]
}

let width = Int(argument("--width", default: "1920")) ?? 1920
let height = Int(argument("--height", default: "1080")) ?? 1080
let name = argument("--name", default: "Horizonte")

guard width >= 640, width <= 7680, height >= 480, height <= 4320 else {
    fputs("tamanho inválido: \(width)x\(height)\n", stderr)
    exit(64)
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
var config: CGDisplayConfigRef?
if CGBeginDisplayConfiguration(&config) == .success, let config = config {
    let main = CGMainDisplayID()
    CGConfigureDisplayOrigin(config, display.displayID, Int32(CGDisplayBounds(main).width), 0)
    CGCompleteDisplayConfiguration(config, .forSession)
}

print("DISPLAY_ID \(display.displayID)")
fflush(stdout)

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
