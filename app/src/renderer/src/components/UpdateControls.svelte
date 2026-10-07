<script lang="ts">
  import { onMount } from 'svelte'
  import type { UpdateStatus, UpdateAction } from '../../../shared/updates'
  let status = $state<UpdateStatus | null>(null)
  let initialError = $state<string | null>(null)
  let loading = $state(false)
  let active = false
  let revision = 0
  onMount(() => {
    active = true
    // Reservado antes de assinar: um push síncrono também é mais novo que a consulta inicial.
    const initialRevision = ++revision
    const stop = window.horizonte.onUpdate((next) => {
      if (!active) return
      revision++
      status = next
      initialError = null
      loading = false
    })
    void loadStatus(initialRevision)
    return () => {
      active = false
      revision++
      stop()
    }
  })
  async function loadStatus(request = ++revision): Promise<void> {
    if (!active) return
    if (request === revision) loading = true
    try {
      const next = await window.horizonte.getUpdateStatus()
      if (!active || request !== revision) return
      status = next
      initialError = null
    } catch {
      if (!active || request !== revision) return
      initialError = 'Não consegui carregar as atualizações. Tente de novo.'
    } finally {
      if (active && request === revision) loading = false
    }
  }
  async function perform(action: UpdateAction): Promise<void> {
    if (!active) return
    const request = ++revision
    try {
      const next = await window.horizonte.update(action)
      if (active && request === revision) status = next
    } catch {
      if (!active || request !== revision) return
      if (status)
        status = {
          ...status,
          phase: 'error',
          message: 'Não consegui verificar a atualização. Tente de novo.'
        }
    }
  }
</script>

<section class="group" aria-labelledby="g-update">
  <h2 class="group-label" id="g-update">Atualizações</h2>
  <div class="card card-pad">
    {#if status}
      <p class="adv-note">Versão {status.currentVersion}</p>
      <p class="adv-note" aria-live="polite">
        {#if status.phase === 'available'}Horizonte {status.version} está disponível.
        {:else if status.phase === 'downloading'}Baixando atualização: {Math.round(
            status.percent ?? 0
          )}%.
        {:else if status.phase === 'ready'}Atualização pronta. Instale quando terminar de usar a
          tela.
        {:else if status.phase === 'checking'}Verificando atualizações…
        {:else if status.phase === 'current'}Você está na versão mais recente.
        {:else if status.phase === 'unavailable'}Nesta instalação, baixe as atualizações pelo
          GitHub.
        {:else}Horizonte {status.currentVersion}{/if}
      </p>
      {#if status.message}<p class="adv-note" role="status">{status.message}</p>{/if}
      {#if status.phase === 'available'}
        <button class="btn btn-primary" onclick={() => perform('download')}
          >Baixar atualização</button
        >
      {:else if status.phase === 'ready'}
        <button class="btn btn-primary" onclick={() => perform('install')}
          >Instalar e reiniciar</button
        >
      {:else if status.phase === 'unavailable'}
        <button class="btn btn-ghost" onclick={() => window.horizonte.openRepo()}
          >Ver no GitHub</button
        >
      {:else if status.phase !== 'checking' && status.phase !== 'downloading'}
        <button class="btn btn-ghost" onclick={() => perform('check')}>Buscar atualização</button>
      {/if}
    {:else if initialError}
      <p class="adv-note" role="alert">{initialError}</p>
      <button class="btn btn-ghost" disabled={loading} onclick={() => loadStatus()}>
        {loading ? 'Carregando…' : 'Tentar de novo'}
      </button>
    {:else}
      <p class="adv-note" aria-live="polite">Carregando atualizações…</p>
    {/if}
  </div>
</section>
