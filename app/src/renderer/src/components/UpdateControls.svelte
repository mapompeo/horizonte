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
  /** "0.1.0-beta.15" vira "0.1.0 beta 15", como no site. */
  const pretty = (version = ''): string => version.replace(/-beta\./, ' beta ')
  const percent = $derived(Math.round(status?.percent ?? 0))
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

<section class="about" aria-labelledby="g-update">
  <h2 class="sr-only" id="g-update">Atualizações</h2>
  <span class="about-icon" aria-hidden="true"
    ><svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      ><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 20h6" /></svg
    ></span
  >
  <span class="about-name">Horizonte</span>
  {#if status}
    <p class="about-line" aria-live="polite">
      {#if status.phase === 'downloading'}Baixando {pretty(status.version)} · {percent}%
      {:else if status.phase === 'ready'}Atualização pronta: {pretty(status.version)}
      {:else if status.phase === 'checking'}Versão {pretty(status.currentVersion)} · Verificando…
      {:else if status.phase === 'current'}Versão {pretty(status.currentVersion)} · Atualizado
      {:else}Versão {pretty(status.currentVersion)}{/if}
    </p>
    {#if status.phase === 'downloading'}
      <div
        class="about-bar"
        role="progressbar"
        aria-label="Baixando atualização"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percent}
      >
        <i style="width: {percent}%"></i>
      </div>
    {/if}
    {#if status.message}<p class="about-line" role="status">{status.message}</p>{/if}
    {#if status.phase === 'available'}
      <button class="about-pill" onclick={() => perform('download')}
        >Atualizar para {pretty(status.version)}</button
      >
    {:else if status.phase === 'ready'}
      <button class="about-pill" onclick={() => perform('install')}>Reiniciar e atualizar</button>
    {:else if status.phase === 'unavailable'}
      <button class="about-link" onclick={() => window.horizonte.openRepo()}
        >Ver atualizações no GitHub</button
      >
    {:else if status.phase !== 'checking' && status.phase !== 'downloading'}
      <button class="about-link" onclick={() => perform('check')}>Verificar atualização</button>
    {/if}
  {:else if initialError}
    <p class="about-line" role="alert">{initialError}</p>
    <button class="about-link" disabled={loading} onclick={() => loadStatus()}>
      {loading ? 'Carregando…' : 'Tentar de novo'}
    </button>
  {:else}
    <p class="about-line" aria-live="polite">Carregando…</p>
  {/if}
</section>
