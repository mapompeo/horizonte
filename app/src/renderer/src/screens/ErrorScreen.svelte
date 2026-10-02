<script lang="ts">
  import type { AppError } from '../../../shared/types'
  import { send } from '../lib/actions'
  import CopyButton from '../components/CopyButton.svelte'

  interface Props {
    error: AppError
  }

  let { error }: Props = $props()
</script>

<div class="badge badge-danger" aria-hidden="true">
  <svg
    width="30"
    height="30"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 8v5M12 16.5v.01" /><path
      d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
    />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title title-md">{error.message}</h1>
  {#if error.detail}<p class="subtitle">{error.detail}</p>{/if}
</div>
<div class="stack gap-xs">
  <button class="btn btn-primary" onclick={() => send({ type: 'RETRY' })}>Tentar de novo</button>
  <CopyButton
    class="btn btn-ghost"
    text={() => [error.message, error.detail ?? ''].join('\n').trim()}
  />
</div>
