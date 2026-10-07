<script lang="ts">
  import { onMount } from 'svelte'
  import type { UpdateStatus, UpdateAction } from '../../../shared/updates'
  let status = $state<UpdateStatus | null>(null)
  onMount(() => {
    let active = true
    const stop = window.horizonte.onUpdate((next) => {
      if (active) status = next
    })
    void window.horizonte
      .getUpdateStatus()
      .then((next) => {
        if (active) status = next
      })
      .catch(() => undefined)
    return () => {
      active = false
      stop()
    }
  })
  async function perform(action: UpdateAction): Promise<void> {
    try {
      status = await window.horizonte.update(action)
    } catch {
      if (status)
        status = {
          ...status,
          phase: 'error',
          message: 'Não consegui verificar a atualização. Tente de novo.'
        }
    }
  }
</script>

{#if status}
  <section class="group" aria-labelledby="g-update">
    <h2 class="group-label" id="g-update">Atualizações</h2>
    <div class="card card-pad">
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
    </div>
  </section>
{/if}
