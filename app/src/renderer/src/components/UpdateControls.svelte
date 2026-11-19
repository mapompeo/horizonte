<script lang="ts">
  import { L } from '../lib/i18n'
  import Logo from './Logo.svelte'
  import ErrorCode from './ErrorCode.svelte'
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
      initialError = `${errorTitle('HZ-501')}. ${errorFix('HZ-501')}`
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
          message: `${errorTitle('HZ-501')}. ${errorFix('HZ-501')}`
        }
    }
  }
  /** A linha da versão, numa expressão só: quebrar em várias deixava espaços sobrando no meio do texto. */
  const aboutLine = (status: UpdateStatus): string => {
    const version = `${L({ pt: 'Versão', en: 'Version', es: 'Versión' })} ${pretty(status.currentVersion)}`
    if (status.phase === 'downloading')
      return `${L({ pt: 'Baixando', en: 'Downloading', es: 'Descargando' })} ${pretty(status.version)} · ${percent}%`
    if (status.phase === 'ready')
      return `${L({ pt: 'Atualização pronta:', en: 'Update ready:', es: 'Actualización lista:' })} ${pretty(status.version)}`
    if (status.phase === 'checking')
      return `${version} · ${L({ pt: 'Verificando…', en: 'Checking…', es: 'Buscando…' })}`
    if (status.phase === 'current')
      return `${version} · ${L({ pt: 'Atualizado', en: 'Up to date', es: 'Actualizado' })}`
    return version
  }
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
  <section class="about" aria-labelledby="g-update">
    <h2 class="sr-only" id="g-update">
      {L({ pt: 'Atualizações', en: 'Updates', es: 'Actualizaciones' })}
    </h2>
    <Logo size={40} />
    <span class="about-name">Horizonte</span>
    {#if status}
      <p class="about-line" aria-live="polite">{aboutLine(status)}</p>
      {#if status.phase === 'downloading'}
        <div
          class="bar bar-sm"
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
      {/if}
      {#if status.message}<p class="about-line" role="status">{status.message}</p>{/if}
      {#if status.phase === 'error'}<ErrorCode code="HZ-501" />{/if}
      {#if status.phase === 'available'}
        <button class="btn btn-primary btn-sm" onclick={() => perform('download')}
          >{updateTo(status.version)}</button
        >
      {:else if status.phase === 'ready'}
        <button class="btn btn-primary btn-sm" onclick={() => perform('install')}
          >{L({
            pt: 'Reiniciar e atualizar',
            en: 'Restart and update',
            es: 'Reiniciar y actualizar'
          })}</button
        >
      {:else if status.phase !== 'unavailable' && status.phase !== 'checking' && status.phase !== 'downloading'}
        <button class="link about-link" onclick={() => perform('check')}
          >{L({
            pt: 'Verificar atualização',
            en: 'Check for updates',
            es: 'Buscar actualizaciones'
          })}</button
        >
      {/if}
    {:else if initialError}
      <p class="about-line" role="alert">{initialError}</p>
      <ErrorCode code="HZ-501" />
      <button class="about-link" disabled={loading} onclick={() => loadStatus()}>
        {loading ? LOADING : L({ pt: 'Tentar de novo', en: 'Try again', es: 'Intentar de nuevo' })}
      </button>
    {:else}
      <p class="about-line" aria-live="polite">{LOADING}</p>
    {/if}
  </section>
{/if}
