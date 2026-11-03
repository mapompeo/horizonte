<script lang="ts">
  import { onMount } from 'svelte'
  import type { VideoHint } from '../../../main/platform/linux/video-driver'

  /** Aviso de driver de vídeo faltando (Linux). Conferido a cada vez que a tela abre: some quando o driver chega. */
  let hint = $state<VideoHint | null>(null)
  onMount(() => {
    void window.horizonte
      .videoHint()
      .then((value) => (hint = value))
      .catch(() => undefined)
  })
</script>

{#if hint}
  <div class="video-hint" role="note">
    <p class="hint">{hint.message}</p>
    {#if hint.command}<code class="video-hint-command">{hint.command}</code>{/if}
  </div>
{/if}
