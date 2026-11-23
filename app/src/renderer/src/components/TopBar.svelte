<script lang="ts">
  import { L } from '../lib/i18n'
  import type { Mode } from '../../../shared/types'
  import { chooseMode, openSettings } from '../lib/actions'

  interface Props {
    mode: Mode
    /** Há conexão que a troca derrubaria: aparelhos conectados (Enviar) ou a tela chegando (Receber). */
    live?: boolean
  }

  let { mode, live = false }: Props = $props()

  /** Trocar com conexão ativa desconecta tudo: antes, a confirmação. */
  let asking = $state<Mode | null>(null)
  function select(next: Mode): void {
    if (next === mode) return
    if (live) asking = next
    else void chooseMode(next)
  }
  function confirm(): void {
    if (asking) void chooseMode(asking)
    asking = null
  }
</script>

<header class="topbar">
  <div class="topbar-left">
    <button
      class="icon-btn"
      aria-label={L({ pt: 'Ajustes', en: 'Settings', es: 'Ajustes' })}
      onclick={openSettings}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        /><circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </div>
  {#if mode !== 'send'}
    <!-- Receber e o modo Mouse ficam nos Ajustes: aqui só o caminho de volta (Enviar é a tela de sempre). -->
    <button class="back" onclick={() => select('send')}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg
      >
      {L({ pt: 'Enviar', en: 'Send', es: 'Enviar' })}
    </button>
  {/if}
  <div class="topbar-right"></div>
</header>

<svelte:window onkeydown={(event) => event.key === 'Escape' && (asking = null)} />
{#if asking}
  <div class="confirm-backdrop" role="presentation" onclick={() => (asking = null)}></div>
  <div class="confirm card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <h2 class="confirm-title" id="confirm-title">
      {L({ pt: 'Voltar para Enviar?', en: 'Back to Send?', es: '¿Volver a Enviar?' })}
    </h2>
    <p class="notice">
      {L({
        pt: 'Você para de receber a tela do outro computador.',
        en: 'You stop receiving the screen of the other computer.',
        es: 'Dejas de recibir la pantalla de la otra computadora.'
      })}
    </p>
    <div class="confirm-actions">
      <button class="btn btn-ghost btn-sm" onclick={() => (asking = null)}
        >{L({ pt: 'Cancelar', en: 'Cancel', es: 'Cancelar' })}</button
      >
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn btn-primary btn-sm" autofocus onclick={confirm}
        >{L({
          pt: 'Trocar',
          en: 'Switch',
          es: 'Cambiar'
        })}</button
      >
    </div>
  </div>
{/if}

<style>
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: color-mix(in srgb, var(--bg) 60%, transparent);
    backdrop-filter: blur(10px);
    -webkit-app-region: no-drag;
  }
  .confirm {
    position: fixed;
    z-index: 61;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: min(340px, calc(100vw - 32px));
    display: grid;
    gap: 12px;
    padding: 22px 22px 18px;
    text-align: center;
    -webkit-app-region: no-drag;
  }
  .confirm-title {
    margin: 0;
    font-size: var(--t-title, 20px);
  }
  .confirm-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
</style>
