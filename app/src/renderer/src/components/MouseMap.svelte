<script lang="ts">
  import type { Host, MouseSide, ScreenSize } from '../../../shared/types'
  import { safeName } from '../lib/copy'
  import { guessKind, type DeviceKind } from '../../../shared/device'
  import DeviceIcon from './DeviceIcon.svelte'

  interface Props {
    own: ScreenSize
    ownKind: DeviceKind
    hosts: Host[]
    sides: Record<string, MouseSide>
    offsets: Record<string, number>
    /** Solto perto deste computador (`side`), ou na faixa de baixo (null: fica fora). */
    onPlace: (name: string, place: { side: MouseSide; offset: number } | null) => void
  }

  let { own, ownKind, hosts, sides, offsets, onPlace }: Props = $props()

  const DOCK = 64
  let width = $state(560)
  const height = 320
  const area = height - DOCK

  /** Enquanto arrasta, o computador segue o mouse solto; só encaixa ao soltar. */
  let drag = $state<{ name: string; x: number; y: number; dx: number; dy: number } | null>(null)

  const sizeOf = (host: Host): ScreenSize => host.screen ?? own
  const biggest = $derived(
    hosts.reduce(
      (max, host) => ({
        width: Math.max(max.width, sizeOf(host).width),
        height: Math.max(max.height, sizeOf(host).height)
      }),
      { width: 1, height: 1 }
    )
  )
  // Escala única para todas as telas, com espaço para um computador em cada lado.
  const scale = $derived(
    Math.min(
      (width * 0.94) / (own.width + 2 * biggest.width),
      (area * 0.94) / (own.height + 2 * biggest.height)
    )
  )
  const me = $derived({
    w: own.width * scale,
    h: own.height * scale,
    x: (width - own.width * scale) / 2,
    y: (area - own.height * scale) / 2
  })

  const horizontal = (side: MouseSide): boolean => side === 'above' || side === 'below'

  /** Mesmo limite do Deskflow: sempre sobra um pedaço encostado para o mouse passar. */
  function clamp(side: MouseSide, peer: ScreenSize, value: number): number {
    const ownEdge = horizontal(side) ? own.width : own.height
    const peerEdge = horizontal(side) ? peer.width : peer.height
    const minimum = Math.min(ownEdge, peerEdge) * 0.05
    return Math.min(Math.max(value * ownEdge, minimum - peerEdge), ownEdge - minimum) / ownEdge
  }

  function boxFor(
    host: Host,
    side: MouseSide,
    offset: number | undefined
  ): { x: number; y: number } {
    const size = sizeOf(host)
    const w = size.width * scale
    const h = size.height * scale
    const edge = horizontal(side) ? [own.width, size.width] : [own.height, size.height]
    const o = clamp(side, size, offset ?? (edge[0]! - edge[1]!) / 2 / edge[0]!)
    if (side === 'left') return { x: me.x - w, y: me.y + o * me.h }
    if (side === 'right') return { x: me.x + me.w, y: me.y + o * me.h }
    if (side === 'above') return { x: me.x + o * me.w, y: me.y - h }
    return { x: me.x + o * me.w, y: me.y + me.h }
  }

  /** Posição de cada um: arrastando, solto; encostado, na borda; fora, enfileirado na faixa de baixo. */
  const boxes = $derived.by(() => {
    let dockX = 16
    return hosts.map((host) => {
      const name = safeName(host.name)
      const size = sizeOf(host)
      const w = size.width * scale
      const h = size.height * scale
      const side = sides[name]
      let x: number
      let y: number
      if (drag?.name === name) {
        x = drag.x - drag.dx
        y = drag.y - drag.dy
      } else if (side) {
        ;({ x, y } = boxFor(host, side, offsets[name]))
      } else {
        // Na faixa de baixo, menores, para caberem vários.
        const dw = Math.min(w, 90)
        const dh = (dw / w) * h
        x = dockX
        y = area + (DOCK - dh) / 2
        dockX += dw + 12
        return { host, name, x, y, w: dw, h: dh, side: undefined }
      }
      return { host, name, x, y, w, h, side }
    })
  })

  /** Encaixa na borda mais perto do centro solto; na faixa de baixo, fica fora. */
  function snap(host: Host, cx: number, cy: number): { side: MouseSide; offset: number } | null {
    if (cy > area) return null
    const size = sizeOf(host)
    const w = size.width * scale
    const h = size.height * scale
    const insideX = cx > me.x && cx < me.x + me.w
    const insideY = cy > me.y && cy < me.y + me.h
    let side: MouseSide
    if (insideX && !insideY) side = cy < me.y + me.h / 2 ? 'above' : 'below'
    else if (insideY && !insideX) side = cx < me.x + me.w / 2 ? 'left' : 'right'
    else {
      // Na diagonal: a borda com a menor distância.
      const distance = {
        left: Math.abs(cx - me.x),
        right: Math.abs(cx - (me.x + me.w)),
        above: Math.abs(cy - me.y),
        below: Math.abs(cy - (me.y + me.h))
      }
      side = (Object.keys(distance) as MouseSide[]).reduce((a, b) =>
        distance[a] <= distance[b] ? a : b
      )
    }
    const raw = horizontal(side) ? (cx - w / 2 - me.x) / me.w : (cy - h / 2 - me.y) / me.h
    return { side, offset: clamp(side, size, raw) }
  }

  let map = $state<HTMLDivElement | null>(null)

  function point(event: PointerEvent): { x: number; y: number } {
    const rect = map!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function down(event: PointerEvent, name: string, x: number, y: number): void {
    const p = point(event)
    drag = { name, x: p.x, y: p.y, dx: p.x - x, dy: p.y - y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent): void {
    if (!drag) return
    const p = point(event)
    drag = { ...drag, x: p.x, y: p.y }
  }

  function up(host: Host, w: number, h: number): void {
    if (!drag) return
    const cx = drag.x - drag.dx + w / 2
    const cy = drag.y - drag.dy + h / 2
    const name = drag.name
    drag = null
    onPlace(name, snap(host, cx, cy))
  }

  function key(event: KeyboardEvent, host: Host, name: string): void {
    const order: MouseSide[] = ['right', 'below', 'left', 'above']
    const side = sides[name]
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onPlace(name, null)
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    // Enter: passa para o próximo lado (fora → direita → embaixo → esquerda → acima → fora).
    const next = side ? order[order.indexOf(side) + 1] : order[0]
    if (!next) return onPlace(name, null)
    const size = sizeOf(host)
    const edge = horizontal(next) ? [own.width, size.width] : [own.height, size.height]
    onPlace(name, { side: next, offset: (edge[0]! - edge[1]!) / 2 / edge[0]! })
  }

  const SIDE_TEXT: Record<MouseSide, string> = {
    left: 'à esquerda',
    right: 'à direita',
    above: 'acima',
    below: 'embaixo'
  }
</script>

<div
  class="mouse-map"
  bind:this={map}
  bind:clientWidth={width}
  style="--h: {height}px; --dock: {DOCK}px"
>
  <div
    class="map-screen map-own"
    style="left: {me.x}px; top: {me.y}px; width: {me.w}px; height: {me.h}px"
  >
    <DeviceIcon kind={ownKind} size={16} />
    <span>Este computador</span>
  </div>
  <div class="map-dock">
    {#if boxes.every((box) => box.side)}<span>Solte aqui para deixar de fora</span>{/if}
  </div>
  {#each boxes as box (box.host.address)}
    <div
      class="map-screen map-peer"
      class:map-out={!box.side && drag?.name !== box.name}
      class:map-dragging={drag?.name === box.name}
      role="button"
      tabindex="0"
      aria-label="{box.name}, {box.side
        ? SIDE_TEXT[box.side]
        : 'fora'}. Arraste até a borda deste computador. Enter troca o lado, Delete deixa de fora."
      style="left: {box.x}px; top: {box.y}px; width: {box.w}px; height: {box.h}px"
      onpointerdown={(event) => down(event, box.name, box.x, box.y)}
      onpointermove={move}
      onpointerup={() =>
        up(box.host, sizeOf(box.host).width * scale, sizeOf(box.host).height * scale)}
      onpointercancel={() => (drag = null)}
      onkeydown={(event) => key(event, box.host, box.name)}
    >
      <DeviceIcon kind={box.host.kind ?? guessKind(box.host.name)} size={16} />
      <span>{box.name}</span>
    </div>
  {/each}
</div>
