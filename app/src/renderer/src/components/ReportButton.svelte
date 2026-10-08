<script lang="ts">
  import CopyButton from './CopyButton.svelte'
  let dialog: HTMLDialogElement
  let text = $state('')
  let includeHistory = $state(false)
  let busy = $state(false)
  let message = $state('')
  async function prepare(): Promise<void> {
    busy = true
    text = ''
    message = ''
    try {
      text = await window.horizonte.getDiagnosticDraft(includeHistory)
    } catch {
      message = 'Não consegui preparar o diagnóstico. Tente de novo ou use Copiar diagnóstico.'
    } finally {
      busy = false
    }
  }
  async function review(): Promise<void> {
    includeHistory = false
    dialog.showModal()
    await prepare()
  }
  async function report(): Promise<void> {
    busy = true
    try {
      const result = await window.horizonte.reportDiagnostic(text)
      message =
        result === 'copied'
          ? 'O texto é longo demais para o link. Copiei o diagnóstico revisado e abri o formulário vazio. Cole o texto, revise e publique no GitHub.'
          : 'Formulário aberto. O diagnóstico só será publicado quando você confirmar no GitHub.'
    } catch {
      message = 'Não consegui abrir o GitHub. Tente de novo ou use Copiar diagnóstico.'
    } finally {
      busy = false
    }
  }
</script>

<button class="btn btn-ghost" onclick={review}>Enviar diagnóstico</button>
<dialog bind:this={dialog} aria-labelledby="report-title">
  <h2 id="report-title">Revisar diagnóstico</h2>
  <p>
    A issue será pública. Você precisa entrar no GitHub para publicar. Abrir o formulário já
    compartilha o texto abaixo com o GitHub.
  </p>
  <p>
    Incluímos informações técnicas e códigos de erro, sem mensagens e detalhes de logs. Confira o
    conteúdo antes de continuar.
  </p>
  <label
    ><input type="checkbox" bind:checked={includeHistory} onchange={prepare} disabled={busy} /> Incluir
    resumo dos erros recentes (até sete dias)</label
  >
  <label for="report-text">Texto que será compartilhado</label>
  <textarea id="report-text" value={text} readonly rows="10"></textarea>
  <p role="status">{busy ? 'Preparando…' : message}</p>
  <div class="actions">
    <button class="btn btn-primary" disabled={busy || !text} onclick={report}
      >Abrir issue no GitHub</button
    >
    <CopyButton />
    <button class="btn btn-ghost" onclick={() => dialog.close()} disabled={busy}>Cancelar</button>
  </div>
</dialog>

<style>
  dialog {
    max-width: min(620px, calc(100vw - 40px));
    max-height: calc(100vh - 40px);
    overflow: auto;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 24px;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  p {
    line-height: 1.5;
  }
  label {
    display: block;
    margin: 12px 0;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    color: var(--fg);
    background: var(--card);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
</style>
