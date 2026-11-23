// horizonte-mouse (Mac): o modo Mouse, com o mesmo protocolo de linhas do auxiliar do Linux.
//
//   --check    pede (uma vez) a permissão de Acessibilidade e sai com 0.
//   --capture  imprime as telas (ZONE largura altura x y, depois ZONES) e recebe barreiras (barrier id x1 y1 x2 y2,
//              clear, apply). Quando o cursor encosta numa barreira, imprime ENTER id x y e passa a segurar o mouse
//              e o teclado aqui, imprimindo move/button/key/wheel/scroll. "release x y" devolve o cursor e imprime LEFT.
//   --inject   recebe warp/move/button/key/wheel/scroll e age neste Mac.
//
// Coordenadas em pontos do macOS. Teclas no código do Linux (evdev).

import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func out(_ line: String) {
    print(line)
}

let mode = CommandLine.arguments.count == 2 ? CommandLine.arguments[1] : ""
guard ["--check", "--capture", "--inject"].contains(mode) else {
    FileHandle.standardError.write("uso: horizonte-mouse --check | --capture | --inject\n".data(using: .utf8)!)
    exit(64)
}
if mode == "--check" {
    let prompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    _ = AXIsProcessTrustedWithOptions([prompt: true] as CFDictionary)
    exit(0)
}

// ---------- teclas: código do Mac <-> evdev ----------

let macToEvdev: [Int64: Int] = [
    0: 30, 1: 31, 2: 32, 3: 33, 4: 35, 5: 34, 6: 44, 7: 45, 8: 46, 9: 47, 10: 86, 11: 48, 12: 16, 13: 17, 14: 18,
    15: 19, 16: 21, 17: 20, 18: 2, 19: 3, 20: 4, 21: 5, 22: 7, 23: 6, 24: 13, 25: 10, 26: 8, 27: 12, 28: 9, 29: 11,
    30: 27, 31: 24, 32: 22, 33: 26, 34: 23, 35: 25, 36: 28, 37: 38, 38: 36, 39: 40, 40: 37, 41: 39, 42: 43, 43: 51,
    44: 53, 45: 49, 46: 50, 47: 52, 48: 15, 49: 57, 50: 41, 51: 14, 53: 1, 54: 126, 55: 125, 56: 42, 57: 58,
    58: 56, 59: 29, 60: 54, 61: 100, 62: 97, 64: 187, 65: 83, 67: 55, 69: 78, 71: 69, 75: 98, 76: 96, 78: 74,
    79: 188, 80: 189, 81: 117, 82: 82, 83: 79, 84: 80, 85: 81, 86: 75, 87: 76, 88: 77, 89: 71, 90: 190, 91: 72,
    92: 73, 93: 124, 94: 89, 95: 121, 96: 63, 97: 64, 98: 65, 99: 61, 100: 66, 101: 67, 103: 87, 105: 183,
    106: 186, 107: 184, 109: 68, 111: 88, 113: 185, 114: 110, 115: 102, 116: 104, 117: 111, 118: 62, 119: 107,
    120: 60, 121: 109, 122: 59, 123: 105, 124: 106, 125: 108, 126: 103,
]
let evdevToMac = Dictionary(macToEvdev.map { ($0.value, $0.key) }, uniquingKeysWith: { first, _ in first })

/// Teclas modificadoras chegam como "flagsChanged": a tecla está apertada se o bit dela está ligado.
let modifierFlag: [Int64: CGEventFlags] = [
    54: .maskCommand, 55: .maskCommand, 56: .maskShift, 60: .maskShift, 57: .maskAlphaShift,
    58: .maskAlternate, 61: .maskAlternate, 59: .maskControl, 62: .maskControl,
]

// ---------- entrada padrão ----------

func readLines(_ handle: @escaping (String) -> Void) {
    Thread.detachNewThread {
        while let line = readLine() {
            DispatchQueue.main.async { handle(line) }
        }
        DispatchQueue.main.async { exit(0) }
    }
}

func numbers(_ line: String) -> [Double] {
    line.split(separator: " ").dropFirst().compactMap { Double($0) }
}

// ---------- captura ----------

struct Barrier {
    let id: Int, x1: Double, y1: Double, x2: Double, y2: Double
}
var pending: [Barrier] = []
var barriers: [Barrier] = []
var active = false

func zones() {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    for id in ids.prefix(Int(count)) {
        let b = CGDisplayBounds(id)
        out("ZONE \(Int(b.width)) \(Int(b.height)) \(Int(b.minX)) \(Int(b.minY))")
    }
    out("ZONES")
}

/// A barreira em que o cursor encostou. Ela fica na borda de fora; o cursor, no último ponto.
func touching(_ p: CGPoint) -> Barrier? {
    barriers.first { b in
        if b.x1 == b.x2 {
            return p.y >= b.y1 && p.y <= b.y2 && p.x <= b.x1 && p.x >= b.x1 - 1
        }
        return p.x >= b.x1 && p.x <= b.x2 && p.y <= b.y1 && p.y >= b.y1 - 1
    }
}

func buttonCode(_ event: CGEvent, _ type: CGEventType) -> Int {
    switch type {
    case .leftMouseDown, .leftMouseUp: return 272
    case .rightMouseDown, .rightMouseUp: return 273
    default:
        let number = event.getIntegerValueField(.mouseEventButtonNumber)
        return number == 2 ? 274 : number == 3 ? 275 : 276
    }
}

func onEvent(_ type: CGEventType, _ event: CGEvent) -> CGEvent? {
    if !active {
        if [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged].contains(type),
           let barrier = touching(event.location)
        {
            active = true
            // O cursor fica parado aqui enquanto o mouse está no outro computador; só os deslocamentos contam.
            CGAssociateMouseAndMouseCursorPosition(0)
            out("ENTER \(barrier.id) \(Int(event.location.x)) \(Int(event.location.y))")
            return nil
        }
        return event
    }
    switch type {
    case .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged:
        let dx = event.getDoubleValueField(.mouseEventDeltaX)
        let dy = event.getDoubleValueField(.mouseEventDeltaY)
        if dx != 0 || dy != 0 { out("move \(dx) \(dy)") }
    case .leftMouseDown, .rightMouseDown, .otherMouseDown:
        out("button \(buttonCode(event, type)) 1")
    case .leftMouseUp, .rightMouseUp, .otherMouseUp:
        out("button \(buttonCode(event, type)) 0")
    case .scrollWheel:
        // No Linux a roda para baixo é positiva; no Mac, para cima.
        let dy = -event.getDoubleValueField(.scrollWheelEventPointDeltaAxis1)
        let dx = -event.getDoubleValueField(.scrollWheelEventPointDeltaAxis2)
        if dx != 0 || dy != 0 { out("scroll \(dx) \(dy)") }
    case .keyDown, .keyUp:
        let mac = event.getIntegerValueField(.keyboardEventKeycode)
        if let code = macToEvdev[mac] { out("key \(code) \(type == .keyDown ? 1 : 0)") }
    case .flagsChanged:
        let mac = event.getIntegerValueField(.keyboardEventKeycode)
        if let code = macToEvdev[mac], let flag = modifierFlag[mac] {
            out("key \(code) \(event.flags.contains(flag) ? 1 : 0)")
        }
    default:
        return event
    }
    return nil
}

func capture() {
    let types: [CGEventType] = [
        .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .leftMouseDown, .leftMouseUp,
        .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp, .scrollWheel, .keyDown, .keyUp, .flagsChanged,
    ]
    let mask = types.reduce(CGEventMask(0)) { $0 | (1 << CGEventMask($1.rawValue)) }
    var tap: CFMachPort?
    tap = CGEvent.tapCreate(
        tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: mask,
        callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if let tap = captureTap { CGEvent.tapEnable(tap: tap, enable: true) }
                return Unmanaged.passUnretained(event)
            }
            guard let kept = onEvent(type, event) else { return nil }
            return Unmanaged.passUnretained(kept)
        }, userInfo: nil)
    guard let tap else {
        FileHandle.standardError.write("o macOS não deixou observar o mouse: falta a permissão de Acessibilidade\n".data(using: .utf8)!)
        exit(3)
    }
    captureTap = tap
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, tap, 0), .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    zones()
    out("READY")
    readLines { line in
        let n = numbers(line)
        if line.hasPrefix("barrier "), n.count == 5 {
            pending.append(Barrier(id: Int(n[0]), x1: n[1], y1: n[2], x2: n[3], y2: n[4]))
        } else if line == "clear" {
            pending = []
        } else if line == "apply" {
            barriers = pending
        } else if line.hasPrefix("release "), n.count == 2 {
            active = false
            CGWarpMouseCursorPosition(CGPoint(x: n[0], y: n[1]))
            CGAssociateMouseAndMouseCursorPosition(1)
            out("LEFT")
        }
    }
}
var captureTap: CFMachPort?

// ---------- injeção ----------

let source = CGEventSource(stateID: .hidSystemState)
var held = Set<Int>()

func desktopOrigin() -> CGPoint {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    let all = ids.prefix(Int(count)).map { CGDisplayBounds($0) }
    return CGPoint(x: all.map(\.minX).min() ?? 0, y: all.map(\.minY).min() ?? 0)
}

func cursor() -> CGPoint {
    CGEvent(source: nil)?.location ?? .zero
}

func postMove(to point: CGPoint) {
    let type: CGEventType = held.contains(272) ? .leftMouseDragged : held.contains(273) ? .rightMouseDragged
        : held.isEmpty ? .mouseMoved : .otherMouseDragged
    CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?
        .post(tap: .cghidEventTap)
}

func inject() {
    out("READY")
    readLines { line in
        let n = numbers(line)
        guard let kind = line.split(separator: " ").first else { return }
        switch kind {
        case "warp" where n.count == 2:
            let origin = desktopOrigin()
            postMove(to: CGPoint(x: origin.x + n[0], y: origin.y + n[1]))
        case "move" where n.count == 2:
            let at = cursor()
            postMove(to: CGPoint(x: at.x + n[0], y: at.y + n[1]))
        case "button" where n.count == 2:
            let code = Int(n[0]), down = n[1] != 0
            guard (272...276).contains(code) else { return }
            if down { held.insert(code) } else { held.remove(code) }
            let button: CGMouseButton = code == 272 ? .left : code == 273 ? .right : .center
            let type: CGEventType = code == 272 ? (down ? .leftMouseDown : .leftMouseUp)
                : code == 273 ? (down ? .rightMouseDown : .rightMouseUp) : (down ? .otherMouseDown : .otherMouseUp)
            let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: cursor(), mouseButton: button)
            if code > 273 { event?.setIntegerValueField(.mouseEventButtonNumber, value: Int64(code - 272)) }
            event?.post(tap: .cghidEventTap)
        case "key" where n.count == 2:
            guard let mac = evdevToMac[Int(n[0])] else { return }
            CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(mac), keyDown: n[1] != 0)?.post(tap: .cghidEventTap)
        case "wheel" where n.count == 2:
            CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 2,
                    wheel1: Int32(-n[1] / 120), wheel2: Int32(-n[0] / 120), wheel3: 0)?.post(tap: .cghidEventTap)
        case "scroll" where n.count == 2:
            CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2,
                    wheel1: Int32(-n[1]), wheel2: Int32(-n[0]), wheel3: 0)?.post(tap: .cghidEventTap)
        default:
            return
        }
    }
}

if mode == "--capture" { capture() } else { inject() }
CFRunLoopRun()
