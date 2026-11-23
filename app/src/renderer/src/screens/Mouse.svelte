<script lang="ts">
  import { L } from '../lib/i18n'
  import { onMount } from 'svelte'
  import type { Host, MouseSide, ScreenSize } from '../../../shared/types'
  import type { DeviceKind } from '../../../shared/device'
  import { copyFor, safeName } from '../lib/copy'
  import { patchSettings, send } from '../lib/actions'
  import ScreenMap from '../components/ScreenMap.svelte'
  import { pollHosts } from '../lib/hosts'
  import { isHostAddress } from '../../../shared/address'

  interface Props {
    /** De que lado fica cada computador, pelo nome; sem lado, fica fora do compartilhamento. */
    sides: Record<string, MouseSide>
    /** Onde começa a borda de cada computador, em fração da borda deste. */
    offsets: Record<string, number>
  }

  let { sides, offsets }: Props = $props()
  let ownScreen = $state<ScreenSize | null>(null)
  let ownKind = $state<DeviceKind>('desktop')

  const copy = copyFor({ screen: 'mouse', mode: 'mouse' })
  let found = $state<Host[]>([])
  /** Adicionados pelo IP nesta tela (não aparecem na procura). */
  let added = $state<Host[]>([])
  let searching = $state(true)
  const hosts = $derived([
    ...found,
    ...added.filter((host) => !found.some((other) => other.address === host.address))
  ])
  const placed = $derived(hosts.filter((host) => sides[safeName(host.name)]))

  let manual = $state(false)
  let address = $state('')
  const valid = $derived(isHostAddress(address.trim()))

  // Procura de novo a cada poucos segundos: uma busca só deixava a lista vazia para sempre se falhasse.
  onMount(() => {
    void window.horizonte
      .ownScreen()
      .then((size) => (ownScreen = size))
      .catch(() => undefined)
    void window.horizonte
      .deviceKind()
      .then((kind) => (ownKind = kind))
      .catch(() => undefined)
    return pollHosts(window.horizonte.listMousePeers, (list, stillSearching) => {
      found = list
      searching = stillSearching
    })
  })

  function addByAddress(): void {
    const host = address.trim()
    if (!isHostAddress(host)) return
    if (!hosts.some((other) => other.address === host))
      added = [...added, { name: host, address: host }]
    address = ''
    manual = false
  }

  function place(name: string, where: { side: MouseSide; offset: number } | null): void {
    const otherSides = Object.fromEntries(Object.entries(sides).filter(([key]) => key !== name))
    const otherOffsets = Object.fromEntries(Object.entries(offsets).filter(([key]) => key !== name))
    void patchSettings(
      where
        ? {
            mouseSides: { ...otherSides, [name]: where.side },
            mouseOffsets: { ...otherOffsets, [name]: where.offset }
          }
        : { mouseSides: otherSides, mouseOffsets: otherOffsets }
    )
  }
</script>

<div class="hosts hosts-wide">
  <h1 class="title">{copy.title}</h1>
  {#if ownScreen}
    <ScreenMap own={ownScreen} {ownKind} {hosts} {sides} {offsets} onPlace={place} height={260} />
  {/if}
  <div class="stack gap-xs mouse-actions">
    {#if hosts.length > 0}
      <button
        class="btn btn-primary"
        disabled={placed.length === 0}
        onclick={() =>
          send({
            type: 'MOUSE_SHARE',
            peers: placed.map((host) => ({ name: safeName(host.name), address: host.address }))
          })}>{L({ pt: 'Usar meu mouse', en: 'Use my mouse', es: 'Usar mi mouse' })}</button
      >
      <span class="searching" aria-live="polite">
        {placed.length === 0
          ? L({
              pt: 'Arraste um aparelho até a borda deste.',
              en: 'Drag a device to the edge of this one.',
              es: 'Arrastra un dispositivo hasta el borde de este.'
            })
          : L({
              pt: `Vai usar o mouse em ${placed.map((host) => safeName(host.name)).join(' e ')}.`,
              en: `The mouse will be used on ${placed.map((host) => safeName(host.name)).join(' and ')}.`,
              es: `Va a usar el mouse en ${placed.map((host) => safeName(host.name)).join(' y ')}.`
            })}
      </span>
    {:else if searching}
      <div role="status">
        <span class="searching">{L({ pt: 'Procurando…', en: 'Searching…', es: 'Buscando…' })}</span>
      </div>
    {:else}
      <div role="status">
        <span class="searching"
          >{L({
            pt: 'Nada por aqui. No outro aparelho, abra Compartilhar o mouse.',
            en: 'Nothing here. On the other device, open Share the mouse.',
            es: 'Nada por aquí. En el otro dispositivo, abre Compartir el mouse.'
          })}</span
        >
      </div>
    {/if}
    {#if manual}
      <form
        class="manual"
        onsubmit={(event) => {
          event.preventDefault()
          addByAddress()
        }}
      >
        <input
          class="text-input manual-input"
          aria-label={L({
            pt: 'Endereço do outro aparelho',
            en: 'Address of the other device',
            es: 'Dirección del otro dispositivo'
          })}
          placeholder="192.168.1.5"
          autocomplete="off"
          spellcheck="false"
          bind:value={address}
        />
        <button class="btn btn-primary btn-sm" type="submit" disabled={!valid}
          >{L({ pt: 'Adicionar', en: 'Add', es: 'Agregar' })}</button
        >
      </form>
    {:else}
      <button class="link" onclick={() => (manual = true)}
        >{L({
          pt: 'Adicionar pelo endereço',
          en: 'Add by address',
          es: 'Agregar por dirección'
        })}</button
      >
    {/if}
  </div>
</div>
