<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Mode } from '../../../shared/types'
  import TopBar from './TopBar.svelte'

  interface Props {
    mode?: Mode | null
    split?: boolean
    children?: Snippet
  }

  let { mode = null, split = false, children }: Props = $props()
</script>

<div class="screen">
  {#if mode}<TopBar {mode} />{/if}
  <main class="center" class:center-split={split}>
    {@render children?.()}
  </main>
</div>
