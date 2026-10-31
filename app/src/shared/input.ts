/**
 * Entrada vinda de quem mostra (mouse, teclado e toque do notebook) para agir na tela estendida de quem envia.
 * Tudo que chega pela rede passa por `parseInput` antes de virar comando: é o que um outro aparelho pode fazer neste
 * computador.
 */

/** Coordenadas são frações da tela estendida (0 a 1), para não depender do tamanho de nenhum dos lados. */
export type InputEvent =
  | { t: 'move'; x: number; y: number }
  | { t: 'button'; button: PointerButton; down: boolean }
  /** Rolagem em passos (cliques da roda); positivo é para baixo e para a direita. */
  | { t: 'wheel'; dx: number; dy: number }
  /** `code` é o `KeyboardEvent.code`: a tecla física, que o computador que envia traduz pelo layout dele. */
  | { t: 'key'; code: string; down: boolean }
  | { t: 'touch'; id: number; phase: 'down' | 'move' | 'up'; x: number; y: number }

export type PointerButton = 'left' | 'middle' | 'right' | 'back' | 'forward'

const BUTTONS: Record<PointerButton, number> = {
  left: 0x110,
  right: 0x111,
  middle: 0x112,
  back: 0x113,
  forward: 0x114
}

/** `KeyboardEvent.code` → código evdev do Linux (o que o Mutter espera). */
export const EVDEV_KEYS: Record<string, number> = (() => {
  const map: Record<string, number> = {
    Escape: 1,
    Digit1: 2,
    Digit2: 3,
    Digit3: 4,
    Digit4: 5,
    Digit5: 6,
    Digit6: 7,
    Digit7: 8,
    Digit8: 9,
    Digit9: 10,
    Digit0: 11,
    Minus: 12,
    Equal: 13,
    Backspace: 14,
    Tab: 15,
    BracketLeft: 26,
    BracketRight: 27,
    Enter: 28,
    ControlLeft: 29,
    Semicolon: 39,
    Quote: 40,
    Backquote: 41,
    ShiftLeft: 42,
    Backslash: 43,
    Comma: 51,
    Period: 52,
    Slash: 53,
    ShiftRight: 54,
    NumpadMultiply: 55,
    AltLeft: 56,
    Space: 57,
    CapsLock: 58,
    NumLock: 69,
    ScrollLock: 70,
    Numpad7: 71,
    Numpad8: 72,
    Numpad9: 73,
    NumpadSubtract: 74,
    Numpad4: 75,
    Numpad5: 76,
    Numpad6: 77,
    NumpadAdd: 78,
    Numpad1: 79,
    Numpad2: 80,
    Numpad3: 81,
    Numpad0: 82,
    NumpadDecimal: 83,
    IntlBackslash: 86,
    F11: 87,
    F12: 88,
    IntlRo: 89,
    NumpadEnter: 96,
    ControlRight: 97,
    NumpadDivide: 98,
    PrintScreen: 99,
    AltRight: 100,
    Home: 102,
    ArrowUp: 103,
    PageUp: 104,
    ArrowLeft: 105,
    ArrowRight: 106,
    End: 107,
    ArrowDown: 108,
    PageDown: 109,
    Insert: 110,
    Delete: 111,
    NumpadEqual: 117,
    Pause: 119,
    NumpadComma: 121,
    MetaLeft: 125,
    MetaRight: 126,
    ContextMenu: 127
  }
  const rows: [string, number][] = [
    ['QWERTYUIOP', 16],
    ['ASDFGHJKL', 30],
    ['ZXCVBNM', 44]
  ]
  for (const [letters, start] of rows)
    [...letters].forEach((letter, i) => (map[`Key${letter}`] = start + i))
  for (let i = 1; i <= 10; i++) map[`F${i}`] = 58 + i
  return map
})()

const isFraction = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
const isSteps = (value: unknown): value is number =>
  Number.isInteger(value) && Math.abs(value as number) <= 20

/** Lê uma mensagem do canal de entrada. Fora do formato, devolve null e nada acontece. */
export function parseInput(raw: string): InputEvent | null {
  if (raw.length > 200) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const m = data as Record<string, unknown>
  switch (m.t) {
    case 'move':
      return isFraction(m.x) && isFraction(m.y) ? { t: 'move', x: m.x, y: m.y } : null
    case 'button':
      return typeof m.button === 'string' &&
        Object.hasOwn(BUTTONS, m.button) &&
        typeof m.down === 'boolean'
        ? { t: 'button', button: m.button as PointerButton, down: m.down }
        : null
    case 'wheel':
      return isSteps(m.dx) && isSteps(m.dy) && (m.dx !== 0 || m.dy !== 0)
        ? { t: 'wheel', dx: m.dx, dy: m.dy }
        : null
    case 'key':
      return typeof m.code === 'string' &&
        Object.hasOwn(EVDEV_KEYS, m.code) &&
        typeof m.down === 'boolean'
        ? { t: 'key', code: m.code, down: m.down }
        : null
    case 'touch':
      return Number.isInteger(m.id) &&
        (m.id as number) >= 0 &&
        (m.id as number) < 10 &&
        (m.phase === 'down' || m.phase === 'move' || m.phase === 'up') &&
        isFraction(m.x) &&
        isFraction(m.y)
        ? { t: 'touch', id: m.id as number, phase: m.phase, x: m.x, y: m.y }
        : null
    default:
      return null
  }
}

export const encodeInput = (event: InputEvent): string => JSON.stringify(event)

const fraction = (value: number): string => value.toFixed(5)

/** O comando que o `horizonte-display` entende (uma linha na entrada padrão dele). */
export function helperCommand(event: InputEvent): string {
  switch (event.t) {
    case 'move':
      return `move ${fraction(event.x)} ${fraction(event.y)}\n`
    case 'button':
      return `button ${BUTTONS[event.button]} ${event.down ? 1 : 0}\n`
    case 'wheel':
      return `wheel ${event.dx} ${event.dy}\n`
    case 'key':
      return `key ${EVDEV_KEYS[event.code]} ${event.down ? 1 : 0}\n`
    case 'touch':
      return `touch ${event.phase} ${event.id} ${fraction(event.x)} ${fraction(event.y)}\n`
  }
}
