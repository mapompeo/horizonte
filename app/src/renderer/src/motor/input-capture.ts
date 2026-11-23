import { EVDEV_KEYS, type InputEvent, type PointerButton } from '../../../shared/input'

/** Quanto tempo segurar Esc para sair (um toque sem querer não derruba a sessão; um toque curto vai para a tela). */
export const HOLD_ESC_MS = 1000

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A área onde a imagem aparece de fato dentro do elemento (`object-fit: contain`): sem as faixas pretas dos lados ou
 * de cima e de baixo.
 */
export function contentRect(
  box: { width: number; height: number },
  video: { width: number; height: number }
): Rect {
  if (!video.width || !video.height || !box.width || !box.height)
    return { x: 0, y: 0, width: box.width, height: box.height }
  const scale = Math.min(box.width / video.width, box.height / video.height)
  const width = video.width * scale
  const height = video.height * scale
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height }
}

/** Um ponto do elemento em fração da imagem (0 a 1); fora da imagem (nas faixas pretas), encosta na borda. */
export function toFraction(point: { x: number; y: number }, rect: Rect): { x: number; y: number } {
  const clamp = (v: number): number => Math.min(1, Math.max(0, v))
  return {
    x: clamp((point.x - rect.x) / rect.width),
    y: clamp((point.y - rect.y) / rect.height)
  }
}

const BUTTONS: (PointerButton | undefined)[] = ['left', 'middle', 'right', 'back', 'forward']

/** `PointerEvent.button` → botão do protocolo (outros botões não vão). */
export const buttonName = (button: number): PointerButton | undefined => BUTTONS[button]

/** Pixels de rolagem que valem um passo da roda (um "clique"); linhas, três por passo. */
const PIXELS_PER_STEP = 50
const LINES_PER_STEP = 3

/**
 * Junta a rolagem em passos inteiros, guardando o que sobra (um touchpad manda muitos pedaços pequenos). Devolve os
 * passos a mandar agora e o resto para a próxima.
 */
export function wheelSteps(
  rest: number,
  delta: number,
  mode: number
): { steps: number; rest: number } {
  const unit = mode === 1 ? LINES_PER_STEP : mode === 2 ? 1 : PIXELS_PER_STEP
  const total = rest + delta / unit
  const steps = Math.trunc(total)
  return { steps: Math.max(-20, Math.min(20, steps)), rest: total - steps }
}

/** A tecla vai para a outra tela? Só as que o protocolo conhece. */
export const sendableKey = (code: string): boolean => Object.hasOwn(EVDEV_KEYS, code)

export interface CaptureOptions {
  /** Elemento onde a imagem aparece (o `<video>`). */
  video: HTMLVideoElement
  send(event: InputEvent): void
  /** Esc segurado: a pessoa quer sair. */
  onQuit(): void
  /** Atalho local, que não vai para a outra tela (Ctrl+Shift+D: os números). */
  onLocalShortcut?(event: KeyboardEvent): boolean
}

/**
 * Liga o mouse, o teclado e o toque desta janela à tela estendida do outro computador. Devolve como desligar.
 * O movimento sai no máximo uma vez por quadro de tela; ao perder o foco, solta tudo que estava apertado.
 */
export function attachInputCapture(options: CaptureOptions): () => void {
  const { video, send } = options
  const pressedKeys = new Set<string>()
  const pressedButtons = new Set<PointerButton>()
  const touches = new Map<number, number>()
  let pendingMove: { x: number; y: number } | null = null
  let frame = 0
  let wheelRestX = 0
  let wheelRestY = 0
  let escTimer: ReturnType<typeof setTimeout> | null = null

  const fraction = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const box = video.getBoundingClientRect()
    const rect = contentRect(
      { width: box.width, height: box.height },
      { width: video.videoWidth, height: video.videoHeight }
    )
    return toFraction({ x: event.clientX - box.left, y: event.clientY - box.top }, rect)
  }

  const flushMove = (): void => {
    frame = 0
    if (pendingMove) send({ t: 'move', ...pendingMove })
    pendingMove = null
  }

  const slotFor = (pointerId: number): number | null => {
    const known = touches.get(pointerId)
    if (known !== undefined) return known
    for (let slot = 0; slot < 10; slot++)
      if (![...touches.values()].includes(slot)) {
        touches.set(pointerId, slot)
        return slot
      }
    return null
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      const slot = touches.get(event.pointerId)
      if (slot !== undefined) send({ t: 'touch', id: slot, phase: 'move', ...fraction(event) })
      return
    }
    pendingMove = fraction(event)
    frame ||= requestAnimationFrame(flushMove)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (event.pointerType === 'touch') {
      const slot = slotFor(event.pointerId)
      if (slot !== null) send({ t: 'touch', id: slot, phase: 'down', ...fraction(event) })
      return
    }
    const button = buttonName(event.button)
    if (!button) return
    // O clique vale onde o ponteiro está agora, não onde estava no último quadro.
    send({ t: 'move', ...fraction(event) })
    pressedButtons.add(button)
    send({ t: 'button', button, down: true })
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      const slot = touches.get(event.pointerId)
      if (slot === undefined) return
      touches.delete(event.pointerId)
      send({ t: 'touch', id: slot, phase: 'up', ...fraction(event) })
      return
    }
    const button = buttonName(event.button)
    if (!button || !pressedButtons.delete(button)) return
    send({ t: 'button', button, down: false })
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const y = wheelSteps(wheelRestY, event.deltaY, event.deltaMode)
    const x = wheelSteps(wheelRestX, event.deltaX, event.deltaMode)
    wheelRestY = y.rest
    wheelRestX = x.rest
    if (x.steps || y.steps) send({ t: 'wheel', dx: x.steps, dy: y.steps })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (options.onLocalShortcut?.(event)) return
    event.preventDefault()
    // Esc: segurado, sai; um toque curto vai para a outra tela, ao soltar.
    if (event.code === 'Escape') {
      if (!event.repeat && !escTimer)
        escTimer = setTimeout(() => {
          escTimer = null
          options.onQuit()
        }, HOLD_ESC_MS)
      return
    }
    // A outra tela repete a tecla sozinha enquanto ela está apertada.
    if (event.repeat || !sendableKey(event.code) || pressedKeys.has(event.code)) return
    pressedKeys.add(event.code)
    send({ t: 'key', code: event.code, down: true })
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    event.preventDefault()
    if (event.code === 'Escape') {
      if (!escTimer) return
      clearTimeout(escTimer)
      escTimer = null
      send({ t: 'key', code: 'Escape', down: true })
      send({ t: 'key', code: 'Escape', down: false })
      return
    }
    if (!pressedKeys.delete(event.code)) return
    send({ t: 'key', code: event.code, down: false })
  }

  /** Perdeu o foco no meio de um atalho: nada pode ficar apertado do outro lado. */
  const releaseAll = (): void => {
    for (const code of pressedKeys) send({ t: 'key', code, down: false })
    for (const button of pressedButtons) send({ t: 'button', button, down: false })
    for (const [, slot] of touches) send({ t: 'touch', id: slot, phase: 'up', x: 0, y: 0 })
    pressedKeys.clear()
    pressedButtons.clear()
    touches.clear()
    if (escTimer) clearTimeout(escTimer)
    escTimer = null
  }

  const noMenu = (event: Event): void => event.preventDefault()

  video.addEventListener('pointermove', onPointerMove)
  video.addEventListener('pointerdown', onPointerDown)
  video.addEventListener('pointerup', onPointerUp)
  video.addEventListener('pointercancel', onPointerUp)
  video.addEventListener('wheel', onWheel, { passive: false })
  video.addEventListener('contextmenu', noMenu)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', releaseAll)

  return () => {
    releaseAll()
    if (frame) cancelAnimationFrame(frame)
    video.removeEventListener('pointermove', onPointerMove)
    video.removeEventListener('pointerdown', onPointerDown)
    video.removeEventListener('pointerup', onPointerUp)
    video.removeEventListener('pointercancel', onPointerUp)
    video.removeEventListener('wheel', onWheel)
    video.removeEventListener('contextmenu', noMenu)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', releaseAll)
  }
}
