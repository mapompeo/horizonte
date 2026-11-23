<script lang="ts">
  import type { DeviceKind } from '../../../shared/device'

  interface Props {
    kind: DeviceKind
    size?: number
  }

  let { kind, size = 26 }: Props = $props()
</script>

<!-- Traço no estilo dos outros ícones do app (grade de 48, traço 2,4). -->
<svg
  width={size}
  height={size}
  viewBox="0 0 48 48"
  fill="none"
  stroke="currentColor"
  stroke-width="2.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if kind === 'laptop'}
    <rect x="9" y="10" width="30" height="21" rx="3.5" /><path d="M4 37h40" />
  {:else if kind === 'tablet'}
    <rect x="11" y="5" width="26" height="38" rx="4" /><path d="M22 37h4" />
  {:else if kind === 'phone'}
    <rect x="15" y="4" width="18" height="40" rx="4" /><path d="M22 38h4" />
  {:else if kind === 'tv'}
    <rect x="4" y="9" width="40" height="25" rx="3" /><path d="M15 41l4-7M33 41l-4-7" />
  {:else}
    <rect x="6" y="8" width="36" height="24" rx="4" /><path d="M16 40h16M24 32v8" />
  {/if}
</svg>
