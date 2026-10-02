<script lang="ts">
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  interface Props {
    device: string
  }

  let { device }: Props = $props()

  const copy = $derived(copyFor({ screen: 'approve', mode: 'send', device }))
</script>

<div class="badge" aria-hidden="true">
  <svg width="36" height="36" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="10" width="30" height="21" rx="3.5" /><path d="M4 37h40" />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title title-md">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<div class="stack gap-xs">
  <button class="btn btn-primary" onclick={() => send({ type: 'APPROVE' })}>Permitir</button>
  <button class="btn btn-ghost" onclick={() => send({ type: 'DENY' })}>Recusar</button>
</div>
<span class="hint-faint">{safeName(device)} · mesma rede</span>
