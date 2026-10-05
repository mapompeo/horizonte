<script lang="ts">
  import { onMount } from 'svelte'
  import type { Host } from '../../../shared/types'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'
  import { pollHosts } from '../lib/hosts'
  import { isHostAddress } from '../../../shared/address'

  const copy = copyFor({ screen: 'discover', mode: 'receive' })
  let hosts = $state<Host[]>([])
  let searching = $state(true)

  let manual = $state(false)
  let address = $state('')
  const valid = $derived(isHostAddress(address.trim()))

  // Procura de novo a cada poucos segundos: uma busca só deixava a lista vazia para sempre se falhasse.
  onMount(() =>
    pollHosts(window.horizonte.listHosts, (found, stillSearching) => {
      hosts = found
      searching = stillSearching
    })
  )

  function connectByAddress(): void {
    const host = address.trim()
    if (isHostAddress(host)) send({ type: 'CONNECT', host, name: host })
  }
</script>

<div class="hosts">
  <h1 class="title title-md">{copy.title}</h1>
  {#each hosts as host (host.address)}
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
        onclick={() => send({ type: 'CONNECT', host: host.address, name: safeName(host.name) })}
        >Estender</button
      >
    </div>
  {/each}
  <div class="stack gap-xs">
    {#if searching}
      <span class="searching">Procurando outros dispositivos…</span>
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
        <button class="btn btn-primary btn-sm" type="submit" disabled={!valid}>Conectar</button>
      </form>
    {:else}
      <button class="link" onclick={() => (manual = true)}>Não aparece? Adicionar pelo IP</button>
    {/if}
  </div>
</div>
