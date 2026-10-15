<script lang="ts">
  import { onMount } from 'svelte'
  import type { ExtendSide, Host } from '../../../shared/types'
  import { copyFor, safeName } from '../lib/copy'
  import { patchSettings, send } from '../lib/actions'
  import Segmented from '../components/Segmented.svelte'
  import { pollHosts } from '../lib/hosts'
  import { isHostAddress } from '../../../shared/address'

  interface Props {
    /** De que lado fica cada computador, pelo nome (o mouse passa pela borda desse lado). */
    sides: Record<string, ExtendSide>
  }

  let { sides }: Props = $props()

  const copy = copyFor({ screen: 'mouse', mode: 'mouse' })
  let hosts = $state<Host[]>([])
  let searching = $state(true)

  let manual = $state(false)
  let address = $state('')
  const valid = $derived(isHostAddress(address.trim()))

  // Procura de novo a cada poucos segundos: uma busca só deixava a lista vazia para sempre se falhasse.
  onMount(() =>
    pollHosts(window.horizonte.listMousePeers, (found, stillSearching) => {
      hosts = found
      searching = stillSearching
    })
  )

  function connectByAddress(): void {
    const host = address.trim()
    if (isHostAddress(host)) send({ type: 'MOUSE_SHARE', host, name: host })
  }
</script>

<div class="hosts">
  <h1 class="title title-md">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
  {#each hosts as host (host.address)}
    {@const name = safeName(host.name)}
    <div class="host-group">
      <div class="host">
        <div class="host-icon" aria-hidden="true">
          <svg
            width="26"
            height="26"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="6" y="8" width="36" height="24" rx="4" /><path d="M16 40h16M24 32v8" />
          </svg>
        </div>
        <div class="host-body">
          <span class="host-name">{safeName(host.name)}</span>
          <span class="host-addr">{host.address} · pronto</span>
        </div>
        <button
          class="btn btn-primary btn-sm"
          onclick={() => send({ type: 'MOUSE_SHARE', host: host.address, name })}
          >Usar meu mouse</button
        >
      </div>
      <div class="host-side">
        <span>{name} fica à</span>
        <Segmented
          compact
          label="De que lado fica {name}"
          value={sides[name] ?? 'right'}
          options={[
            { value: 'left', text: 'Esquerda' },
            { value: 'above', text: 'Acima' },
            { value: 'right', text: 'Direita' }
          ]}
          onSelect={(value) =>
            patchSettings({ mouseSides: { ...sides, [name]: value as ExtendSide } })}
        />
      </div>
    </div>
  {/each}
  <div class="stack gap-xs">
    {#if searching}
      <span class="searching">Procurando outros computadores com o Horizonte no modo Mouse…</span>
    {/if}
    {#if manual}
      <form
        class="manual"
        onsubmit={(event) => {
          event.preventDefault()
          connectByAddress()
        }}
      >
        <input
          class="text-input manual-input"
          aria-label="Endereço do outro dispositivo"
          placeholder="192.168.1.5"
          autocomplete="off"
          spellcheck="false"
          bind:value={address}
        />
        <button class="btn btn-primary btn-sm" type="submit" disabled={!valid}
          >Usar meu mouse</button
        >
      </form>
    {:else}
      <button class="link" onclick={() => (manual = true)}>Não aparece? Adicionar pelo IP</button>
    {/if}
  </div>
</div>
