<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    tone: 'ok' | 'wait'
    children?: Snippet
  }

  let { tone, children }: Props = $props()
</script>

<span class="pill pill-{tone}"><span class="dot"></span>{@render children?.()}</span>
