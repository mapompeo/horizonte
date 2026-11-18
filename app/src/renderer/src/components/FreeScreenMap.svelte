<script lang="ts">
  import { L } from '../lib/i18n'
  import { overlap, snapRect, sideOf, type Rect } from '../../../shared/placement'
  import type { LinkQuality, ScreenPlacement, ScreenSize } from '../../../shared/types'
  import { safeName } from '../lib/copy'

  const LINK_LABEL: Record<LinkQuality, string> = {
    good: L({ pt: 'Conexão boa', en: 'Good connection', es: 'Conexión buena' }),
    fair: L({ pt: 'Conexão regular', en: 'Fair connection', es: 'Conexión regular' }),
    poor: L({
      pt: 'Conexão fraca: aproxime do roteador',
      en: 'Weak connection: move closer to the router',
      es: 'Conexión débil: acércate al router'
    })
  }

  /** Uma tela estendida no mapa: tamanho em unidades da área de trabalho deste computador. */
  export interface FreeScreen {
    key: string
    name: string
    size: ScreenSize
    placement: ScreenPlacement
    /** Uma linha pequena embaixo do nome (a resolução, por exemplo). */
    detail?: string
    /** A conexão com ele: a bolinha fica verde, amarela ou vermelha. */
    quality?: LinkQuality
  }

  interface Props {
    /** Este computador (as telas de verdade), na mesma unidade das outras. */
    own: ScreenSize
    screens: FreeScreen[]
    onPlace: (key: string, placement: ScreenPlacement) => void
    /** Com ele, cada tela ganha um ✕ para parar. */
    onStop?: (key: string) => void
    ownDetail?: string
    height?: number
  }

  let { own, screens, onPlace, onStop, ownDetail, height = 220 }: Props = $props()

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
  /**
   * Onde cada tela aparece. Posições guardadas que caem em cima de outra (de antes, só pelo lado) vão para a borda
   * livre mais perto: no mapa nenhuma tela fica sobre a outra. A que está sendo arrastada segue o mouse.
   */
  const rects = $derived.by(() => {
    const placed: Rect[] = [me]
    const out: { s: FreeScreen; r: Rect }[] = []
    for (const s of screens) {
      if (drag?.key === s.key) {
        out.push({ s, r: drag.rect })
        continue
      }
      let r = rectOf(s)
      if (placed.some((p) => overlap(r, p))) r = snapRect(r, placed)
      placed.push(r)
      out.push({ s, r })
    }
    return out
  })

  /** Uma escala só para tudo (proporção real), com folga de uma tela em volta para arrastar. */
  const view = $derived.by(() => {
    const all = [me, ...rects.map((x) => x.r)]
    const l = Math.min(...all.map((r) => r.x))
    const t = Math.min(...all.map((r) => r.y))
    const rr = Math.max(...all.map((r) => r.x + r.w))
    const b = Math.max(...all.map((r) => r.y + r.h))
    // Folga em volta para arrastar para qualquer lado, proporcional ao conjunto.
    const pad = Math.max(rr - l, b - t) * 0.1
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
  <div class="tile own" style={box(me)}>
    <span class="name"
      >{L({ pt: 'Este computador', en: 'This computer', es: 'Esta computadora' })}</span
    >
    {#if ownDetail}<span class="detail">{ownDetail}</span>{/if}
  </div>
  {#each rects as { s, r } (s.key)}
    <div
      class="tile peer"
      class:dragging={drag?.key === s.key}
      style={box(r)}
      role="button"
      tabindex="0"
      aria-label={`${safeName(s.name)}: ${L({ pt: 'arraste ou use as setas para posicionar', en: 'drag or use the arrow keys to place it', es: 'arrastra o usa las flechas para colocarla' })}`}
      onpointerdown={(event) => down(event, s, r)}
      onpointermove={move}
      onpointerup={() => up(s)}
      onpointercancel={() => up(s)}
      onkeydown={(event) => key(event, s, r)}
    >
      {#if onStop}
        <button
          class="stop"
          aria-label={`${L({ pt: 'Parar', en: 'Stop', es: 'Detener' })} ${safeName(s.name)}`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={() => onStop(s.key)}>✕</button
        >
      {/if}
      <span class="name"
        >{#if s.quality}<span
            class="dot {s.quality}"
            role="img"
            aria-label={LINK_LABEL[s.quality]}
            title={LINK_LABEL[s.quality]}
          ></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}{safeName(s.name)}</span
      >
      {#if s.detail}<span class="detail">{s.detail}</span>{/if}
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
    flex-direction: column;
    gap: 2px;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 8px;
    font-size: var(--t-small);
    overflow: hidden;
    user-select: none;
  }
  .name,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .detail {
    font-size: 10px;
    font-weight: 400;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .dot.fair {
    background: #ffcc00;
  }
  .dot.poor {
    background: var(--danger-fg);
  }
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 50%;
    background: var(--ok-dot);
    vertical-align: middle;
  }
  .stop {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--card);
    color: var(--muted);
    font-size: 10px;
    line-height: 18px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .stop:hover {
    color: var(--danger-fg);
  }
  /* Área de toque maior que o círculo desenhado. */
  .stop::after {
    content: '';
    position: absolute;
    inset: -10px;
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
  /* Tela nova estala no lugar; ao passar o mouse, levanta um pouco (dá para pegar). */
  .peer {
    animation: tile-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .peer:hover:not(.dragging) {
    box-shadow:
      inset 0 0 0 1.5px var(--accent),
      0 6px 18px rgba(0, 0, 0, 0.18);
  }
  @keyframes tile-in {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
  }
  .peer.dragging {
    cursor: grabbing;
    transition: none;
    z-index: 2;
    transform: scale(1.04);
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
      animation: none;
    }
  }
</style>
