<script lang="ts">
  let pending = $state(false)
  let message = $state('')
  async function uninstall(): Promise<void> {
    if (pending) return
    pending = true
    message = ''
    try {
      const result = await window.horizonte.uninstall()
      message = {
        started: 'O desinstalador foi aberto.',
        cancelled: '',
        busy: 'Encerre a conexão e aguarde a atualização antes de desinstalar.',
        manual:
          window.horizonte.platform === 'darwin'
            ? 'Feche o Horizonte e mova-o de Aplicativos para a Lixeira.'
            : 'Feche o Horizonte e remova-o pelo gerenciador de aplicativos. Para AppImage, exclua o arquivo baixado.',
        unavailable:
          'Use Aplicativos instalados nas configurações do sistema para remover o Horizonte.',
        failed: 'Não consegui abrir o desinstalador. Tente pelas configurações do sistema.'
      }[result]
    } catch {
      message = 'Não consegui abrir o desinstalador. Tente de novo.'
    } finally {
      pending = false
    }
  }
</script>

<section class="group" aria-labelledby="g-uninstall">
  <h2 class="group-label" id="g-uninstall">Instalação</h2>
  <div class="card">
    <div class="row">
      <span>Remover deste dispositivo</span>
      <button onclick={uninstall} disabled={pending}
        >{pending ? 'Abrindo…' : 'Desinstalar Horizonte'}</button
      >
    </div>
  </div>
  {#if message}<p class="adv-note" role="status">{message}</p>{/if}
</section>

<style>
  button {
    border: 0;
    border-radius: 8px;
    padding: 8px 10px;
    background: transparent;
    color: var(--danger-fg);
    font-size: inherit;
    transition: background 160ms ease;
  }
  button:hover {
    background: var(--danger-bg);
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
