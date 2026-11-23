<script lang="ts">
  import { L } from '../lib/i18n'
  import { onMount } from 'svelte'
  import type { VideoHint } from '../../../main/platform/linux/video-driver'

  /** Aviso de driver de vídeo faltando (Linux). Conferido a cada vez que a tela abre: some quando o driver chega. */
  let hint = $state<VideoHint | null>(null)
  let copied = $state(false)
  let freeing = $state(false)
  /** Linux: pede a senha do sistema e libera o ufw; o aviso some se deu certo. */
  async function allow(): Promise<void> {
    freeing = true
    await window.horizonte.allowFirewall().catch(() => null)
    hint = await window.horizonte.videoHint().catch(() => hint)
    freeing = false
  }
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
        >{copied
          ? L({ pt: 'Copiado', en: 'Copied', es: 'Copiado' })
          : L({ pt: 'Copiar comando', en: 'Copy command', es: 'Copiar comando' })}</button
      >
    {/if}
    {#if hint.action === 'allow-firewall'}
      <button class="link" disabled={freeing} onclick={allow}
        >{L({
          pt: 'Liberar no firewall',
          en: 'Allow through firewall',
          es: 'Permitir en el firewall'
        })}</button
      >
    {/if}
  </div>
{/if}
