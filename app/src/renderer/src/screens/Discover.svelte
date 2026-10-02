<script lang="ts">
  import { onMount } from 'svelte'
  import type { Host } from '../../../shared/types'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  const copy = copyFor({ screen: 'discover', mode: 'receive' })
  let hosts = $state<Host[]>([])
  let searching = $state(true)

  onMount(() => {
    let alive = true
    window.horizonte
      .listHosts()
      .then((found) => {
        if (alive) hosts = found
      })
      .finally(() => {
        if (alive) searching = false
      })
    return () => {
      alive = false
    }
  })
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
      <span class="searching">Procurando outros computadores…</span>
    {/if}
    <button class="link">Não aparece? Adicionar pelo IP</button>
  </div>
</div>
