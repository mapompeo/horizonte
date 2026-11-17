<script lang="ts">
  import { snapRect, sideOf, type Rect } from '../../../shared/placement'
  import type { ScreenPlacement, ScreenSize } from '../../../shared/types'
  import { safeName } from '../lib/copy'

  /** Uma tela estendida no mapa: tamanho em unidades da área de trabalho deste computador. */
  export interface FreeScreen {
    key: string
    name: string
    size: ScreenSize
    placement: ScreenPlacement
  }

  interface Props {
    /** Este computador (as telas de verdade), na mesma unidade das outras. */
    own: ScreenSize
    screens: FreeScreen[]
    onPlace: (key: string, placement: ScreenPlacement) => void
    height?: number
  }

  let { own, screens, onPlace, height = 220 }: Props = $props()

  let width = $state(480)
  const me: Rect = $derived({ x: 0, y: 0, w: own.width, h: own.height })

  /** Onde cada tela está guardada: a posição livre, ou o lado (e o início) de antes. */
  function rectOf(s: FreeScreen): Rect {
    const w = s.size.width
    const h = s.size.height
    const p = s.placement
    if (p.x !== undefined && p.y !== undefined)
      return { x: p.x * own.width, y: p.y * own.height, w, h }
    const along = p.side === 'above' || p.side === 'below'
    const start =
      p.offset ?? (along ? (own.width - w) / 2 / own.width : (own.height - h) / 2 / own.height)
    if (p.side === 'left') return { x: -w, y: start * own.height, w, h }
    if (p.side === 'right') return { x: own.width, y: start * own.height, w, h }
    if (p.side === 'above') return { x: start * own.width, y: -h, w, h }
    return { x: start * own.width, y: own.height, w, h }
  }

  let drag = $state<{ key: string; rect: Rect; px: number; py: number } | null>(null)
  const rects = $derived(
    screens.map((s) => ({ s, r: drag?.key === s.key ? drag.rect : rectOf(s) }))
  )

  /** Uma escala só para tudo (proporção real), com folga de uma tela em volta para arrastar. */
  const view = $derived.by(() => {
    const all = [me, ...rects.map((x) => x.r)]
    const l = Math.min(...all.map((r) => r.x))
    const t = Math.min(...all.map((r) => r.y))
    const rr = Math.max(...all.map((r) => r.x + r.w))
    const b = Math.max(...all.map((r) => r.y + r.h))
    // Folga em volta para arrastar para qualquer lado, proporcional ao conjunto.
    const pad = Math.max(rr - l, b - t) * 0.18
    const left = l - pad
    const top = t - pad
    const right = rr + pad
    const bottom = b + pad
    const scale = Math.min(width / (right - left), height / (bottom - top))
    return {
      scale,
      ox: (width - (right - left) * scale) / 2 - left * scale,
      oy: (height - (bottom - top) * scale) / 2 - top * scale
    }
  })
  const box = (r: Rect): string =>
    `left:${view.ox + r.x * view.scale}px;top:${view.oy + r.y * view.scale}px;width:${r.w * view.scale}px;height:${r.h * view.scale}px`

  function others(key: string): Rect[] {
    return [me, ...rects.filter((x) => x.s.key !== key).map((x) => x.r)]
  }

  function commit(s: FreeScreen, want: Rect): void {
    const r = snapRect(want, others(s.key))
    onPlace(s.key, { side: sideOf(r, me), x: r.x / own.width, y: r.y / own.height })
  }

  function down(event: PointerEvent, s: FreeScreen, r: Rect): void {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    drag = { key: s.key, rect: r, px: event.clientX, py: event.clientY }
  }
  function move(event: PointerEvent): void {
    if (!drag) return
    const dx = (event.clientX - drag.px) / view.scale
    const dy = (event.clientY - drag.py) / view.scale
    drag = {
      ...drag,
      rect: { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy },
      px: event.clientX,
      py: event.clientY
    }
  }
  function up(s: FreeScreen): void {
    if (!drag || drag.key !== s.key) return
    const want = drag.rect
    drag = null
    commit(s, want)
  }

  /** Setas: um passo de 10% da tela, já encaixado. */
  function key(event: KeyboardEvent, s: FreeScreen, r: Rect): void {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ]
    if (!step) return
    event.preventDefault()
    commit(s, { ...r, x: r.x + step[0]! * r.w * 0.5, y: r.y + step[1]! * r.h * 0.5 })
  }
</script>

<div class="map" bind:clientWidth={width} style="height:{height}px">
  <div class="tile own" style={box(me)}><span>Este computador</span></div>
  {#each rects as { s, r } (s.key)}
    <div
      class="tile peer"
      class:dragging={drag?.key === s.key}
      style={box(r)}
      role="button"
      tabindex="0"
      aria-label="{safeName(s.name)}: arraste ou use as setas para posicionar"
      onpointerdown={(event) => down(event, s, r)}
      onpointermove={move}
      onpointerup={() => up(s)}
      onpointercancel={() => up(s)}
      onkeydown={(event) => key(event, s, r)}
    >
      <span>{safeName(s.name)}</span>
    </div>
  {/each}
</div>

<style>
  .map {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--radius-small, 12px);
    touch-action: none;
  }
  .tile {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 8px;
    font-size: var(--t-small);
    overflow: hidden;
    user-select: none;
  }
  .tile span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .own {
    background: var(--seg);
    color: var(--muted);
  }
  .peer {
    background: color-mix(in srgb, var(--accent) 16%, var(--card));
    box-shadow: inset 0 0 0 1.5px var(--accent);
    color: var(--fg);
    font-weight: 600;
    cursor: grab;
    transition:
      left 0.25s cubic-bezier(0.32, 0.72, 0, 1),
      top 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .peer.dragging {
    cursor: grabbing;
    transition: none;
    z-index: 2;
    box-shadow:
      inset 0 0 0 1.5px var(--accent),
      0 8px 24px rgba(0, 0, 0, 0.3);
  }
  .peer:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .peer {
      transition: none;
    }
  }
</style>
