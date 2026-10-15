<script lang="ts">
  import type { ExtendSide, ScreenSize } from '../../../shared/types'

  interface Props {
    name: string
    own: ScreenSize
    peer: ScreenSize
    side: ExtendSide
    /** Onde começa a borda do outro, em fração da borda deste; sem valor, centralizado. */
    offset: number | undefined
    onChange: (side: ExtendSide, offset: number) => void
  }

  let { name, own, peer, side, offset, onChange }: Props = $props()

  const WIDTH = 440
  const HEIGHT = 150
  let map = $state<HTMLDivElement | null>(null)
  /** Enquanto arrasta, a posição fica aqui; ao soltar, vai para os ajustes. */
  let draft = $state<{ side: ExtendSide; offset: number } | null>(null)

  // Escala única para as duas telas, com espaço para o outro em qualquer lado.
  const scale = $derived(
    Math.min(
      (WIDTH * 0.92) / (own.width + 2 * peer.width),
      (HEIGHT * 0.92) / (own.height + 2 * peer.height)
    )
  )
  const me = $derived({
    w: own.width * scale,
    h: own.height * scale,
    x: (WIDTH - own.width * scale) / 2,
    y: (HEIGHT - own.height * scale) / 2
  })
  const other = $derived({ w: peer.width * scale, h: peer.height * scale })

  const edgeOf = (s: ExtendSide): { own: number; peer: number } =>
    s === 'above' ? { own: own.width, peer: peer.width } : { own: own.height, peer: peer.height }

  /** Mesmo limite do Deskflow: sempre sobra um pedaço encostado para o mouse passar. */
  function clamp(s: ExtendSide, value: number): number {
    const edge = edgeOf(s)
    const minimum = Math.min(edge.own, edge.peer) * 0.05
    const start = Math.min(Math.max(value * edge.own, minimum - edge.peer), edge.own - minimum)
    return start / edge.own
  }

  const current = $derived.by(() => {
    if (draft) return draft
    const edge = edgeOf(side)
    return { side, offset: clamp(side, offset ?? (edge.own - edge.peer) / 2 / edge.own) }
  })

  const box = $derived.by(() => {
    const { side: s, offset: o } = current
    if (s === 'above') return { x: me.x + o * me.w, y: me.y - other.h }
    return { x: s === 'left' ? me.x - other.w : me.x + me.w, y: me.y + o * me.h }
  })

  /** Encaixa na borda mais perto do ponto (o centro do outro computador). */
  function snap(cx: number, cy: number): { side: ExtendSide; offset: number } {
    const toLeft = Math.abs(cx - me.x)
    const toRight = Math.abs(cx - (me.x + me.w))
    const toTop = Math.abs(cy - me.y)
    const s: ExtendSide =
      cy < me.y && toTop < Math.min(toLeft, toRight)
        ? 'above'
        : toLeft <= toRight
          ? 'left'
          : 'right'
    const o = s === 'above' ? (cx - other.w / 2 - me.x) / me.w : (cy - other.h / 2 - me.y) / me.h
    return { side: s, offset: clamp(s, o) }
  }

  let grab: { dx: number; dy: number } | null = null

  function down(event: PointerEvent): void {
    const rect = map!.getBoundingClientRect()
    grab = {
      dx: event.clientX - rect.left - (box.x + other.w / 2),
      dy: event.clientY - rect.top - (box.y + other.h / 2)
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent): void {
    if (!grab || !map) return
    const rect = map.getBoundingClientRect()
    draft = snap(event.clientX - rect.left - grab.dx, event.clientY - rect.top - grab.dy)
  }

  function up(): void {
    if (!grab) return
    grab = null
    if (draft) onChange(draft.side, draft.offset)
    draft = null
  }

  function key(event: KeyboardEvent): void {
    const step = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[
      event.key
    ]
    if (!step) return
    event.preventDefault()
    const next = snap(box.x + other.w / 2 + step[0]!, box.y + other.h / 2 + step[1]!)
    onChange(next.side, next.offset)
  }

  const label = $derived({ left: 'à esquerda', right: 'à direita', above: 'acima' }[current.side])
</script>

<div class="mouse-map" bind:this={map} style="--w: {WIDTH}px; --h: {HEIGHT}px">
  <div
    class="map-screen map-own"
    style="left: {me.x}px; top: {me.y}px; width: {me.w}px; height: {me.h}px"
  >
    Este computador
  </div>
  <div
    class="map-screen map-peer"
    role="slider"
    tabindex="0"
    aria-label="Posição de {name}: arraste ou use as setas"
    aria-valuetext="{name} {label}"
    aria-valuenow={Math.round(current.offset * 100)}
    style="left: {box.x}px; top: {box.y}px; width: {other.w}px; height: {other.h}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  >
    {name}
  </div>
</div>
