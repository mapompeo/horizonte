<script lang="ts">
  import DeviceIcon from '../components/DeviceIcon.svelte'
  import { guessKind, type DeviceKind } from '../../../shared/device'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  interface Props {
    device: string
    address: string
  }

  let { device, address }: Props = $props()

  const copy = $derived(copyFor({ screen: 'mouse-request', mode: 'mouse', device, address }))
  let announced = $state<DeviceKind | null>(null)
  const kind = $derived(announced ?? guessKind(device))
  $effect(() => {
    void window.horizonte
      .deviceKind(address, device)
      .then((value) => (announced = value))
      .catch(() => undefined)
  })
</script>

<div class="badge">
  <DeviceIcon {kind} size={36} />
</div>

<div class="stack gap-sm">
  <h1 class="title title-md">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
<div class="stack gap-xs">
  <button class="btn btn-primary" onclick={() => send({ type: 'MOUSE_ACCEPT' })}>Permitir</button>
  <button class="btn btn-ghost" onclick={() => send({ type: 'MOUSE_DENY' })}>Recusar</button>
</div>
<span class="hint-faint">{safeName(device)} · {address}</span>
