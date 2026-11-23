<script lang="ts">
  import { L } from '../lib/i18n'
  import ErrorCode from './ErrorCode.svelte'
  import { CHANGELOG } from '../../../shared/changelog'
  import { currentLang } from '../../../shared/lang'
  import { errorFix, errorTitle } from '../../../shared/errors'
  interface Props {
    /** Uma linha discreta no rodapé da tela principal, em vez do bloco "Sobre" dos Ajustes. */
    compact?: boolean
  }

  let { compact = false }: Props = $props()
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
      initialError = `${errorTitle('501')}. ${errorFix('501')}`
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
          message: `${errorTitle('501')}. ${errorFix('501')}`
        }
    }
  }
  /** "19 de novembro", no idioma do app. */
  const dateOf = (day: string): string =>
    new Date(`${day}T12:00:00`).toLocaleDateString(
      { pt: 'pt-BR', en: 'en-US', es: 'es' }[currentLang()],
      { day: 'numeric', month: 'long' }
    )
  const LOADING = L({ pt: 'Carregando…', en: 'Loading…', es: 'Cargando…' })
  const updateTo = (version?: string): string =>
    `${L({ pt: 'Atualizar para', en: 'Update to', es: 'Actualizar a' })} ${pretty(version)}`
</script>

{#if compact}
  <!-- Só com algo a fazer: a versão fica nos Ajustes. -->
  <footer class="version-foot">
    {#if status && ['available', 'downloading', 'ready'].includes(status.phase)}
      {#if status.phase === 'available'}
        <button
          class="foot-link"
          title={updateTo(status.version)}
          aria-label={updateTo(status.version)}
          onclick={() => perform('download')}
          >{L({ pt: 'Atualizar', en: 'Update', es: 'Actualizar' })}</button
        >
      {:else if status.phase === 'downloading'}
        <span aria-live="polite"
          >{L({ pt: 'Baixando', en: 'Downloading', es: 'Descargando' })} {percent}%</span
        >
        <div
          class="bar bar-xs"
          role="progressbar"
          aria-label={L({
            pt: 'Baixando atualização',
            en: 'Downloading update',
            es: 'Descargando actualización'
          })}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={percent}
        >
          <div class="bar-fill" style="width: {percent}%"></div>
        </div>
      {:else if status.phase === 'ready'}
        <button class="foot-link" onclick={() => perform('install')}
          >{L({
            pt: 'Reiniciar e atualizar',
            en: 'Restart and update',
            es: 'Reiniciar y actualizar'
          })}</button
        >
        {#if status.message}<span role="status">{status.message}</span>{/if}
      {/if}
    {/if}
  </footer>
{:else}
  <!-- Linhas do cartão "Sobre" dos Ajustes: a versão, a atualização e o que mudou, no mesmo jeito das outras partes. -->
  {#if status}
    <div class="row">
      <span>{L({ pt: 'Versão', en: 'Version', es: 'Versión' })}</span>
      <span class="row-value">{pretty(status.currentVersion)}</span>
    </div>
    {#if status.phase === 'checking'}
      <div class="row">
        <span>{L({ pt: 'Atualização', en: 'Update', es: 'Actualización' })}</span>
        <span class="row-value" aria-live="polite"
          >{L({ pt: 'Verificando…', en: 'Checking…', es: 'Buscando…' })}</span
        >
      </div>
    {:else if status.phase === 'downloading'}
      <div class="row">
        <span
          >{L({ pt: 'Baixando', en: 'Downloading', es: 'Descargando' })}
          {pretty(status.version)}</span
        >
        <span
          class="row-value"
          role="progressbar"
          aria-label={L({
            pt: 'Baixando atualização',
            en: 'Downloading update',
            es: 'Descargando actualización'
          })}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={percent}>{percent}%</span
        >
      </div>
    {:else if status.phase === 'available'}
      <button class="row row-button row-accent" onclick={() => perform('download')}
        >{updateTo(status.version)}</button
      >
    {:else if status.phase === 'ready'}
      <button class="row row-button row-accent" onclick={() => perform('install')}
        >{L({
          pt: 'Reiniciar e atualizar',
          en: 'Restart and update',
          es: 'Reiniciar y actualizar'
        })}</button
      >
    {:else if status.phase !== 'unavailable'}
      <button class="row row-button" onclick={() => perform('check')}
        ><span class="row-grow"
          >{L({
            pt: 'Verificar atualização',
            en: 'Check for updates',
            es: 'Buscar actualizaciones'
          })}</span
        >{#if status.phase === 'current'}<span class="row-value"
            >{L({ pt: 'Atualizado', en: 'Up to date', es: 'Actualizado' })}</span
          >{/if}</button
      >
    {/if}
    {#if status.message}
      <p class="row-note" role="status">{status.message}</p>
    {/if}
    {#if status.phase === 'error'}<p class="row-note">
        <ErrorCode code={status.code ?? '501'} />
      </p>{/if}
    <details class="changes">
      <summary class="row row-button"
        >{L({ pt: 'O que mudou', en: 'What’s new', es: 'Qué cambió' })}</summary
      >
      <div class="changes-body">
        {#each CHANGELOG.slice(0, 2) as change (change.date)}
          <p class="changes-date">{dateOf(change.date)}</p>
          <ul>
            {#each change.items as item, i (i)}<li>{L(item)}</li>{/each}
          </ul>
        {/each}
      </div>
    </details>
  {:else if initialError}
    <p class="row-note" role="alert">{initialError}</p>
    <p class="row-note"><ErrorCode code="501" /></p>
    <button class="row row-button retry" disabled={loading} onclick={() => loadStatus()}>
      {loading ? LOADING : L({ pt: 'Tentar de novo', en: 'Try again', es: 'Intentar de nuevo' })}
    </button>
  {:else}
    <div class="row"><span class="row-value" aria-live="polite">{LOADING}</span></div>
  {/if}
{/if}
