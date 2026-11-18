<script lang="ts">
  import { onMount } from 'svelte'
  import type { VideoHint } from '../../../main/platform/linux/video-driver'

  /** Aviso de driver de vídeo faltando (Linux). Conferido a cada vez que a tela abre: some quando o driver chega. */
  let hint = $state<VideoHint | null>(null)
  let copied = $state(false)
  async function copy(command: string): Promise<void> {
    await window.horizonte.copyText(command).catch(() => undefined)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
  onMount(() => {
    void window.horizonte
      .videoHint()
      .then((value) => (hint = value))
      .catch(() => undefined)
  })
</script>

{#if hint}
  <div class="video-hint" role="note">
    <p class="notice">{hint.message}</p>
    {#if hint.command}
      {@const command = hint.command}
      <code class="video-hint-command">{command}</code>
      <button class="link" onclick={() => copy(command)}
        >{copied ? 'Copiado' : 'Copiar comando'}</button
      >
    {/if}
  </div>
{/if}
