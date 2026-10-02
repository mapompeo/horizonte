<script lang="ts">
  import { isValidPin } from '../../../shared/pin'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'

  interface Props {
    device: string
    pin: string | null
  }

  let { device, pin }: Props = $props()

  let typed = $state('')

  const copy = $derived(copyFor({ screen: 'approve', mode: 'send', device, pairingId: '', pin }))
  const ready = $derived(isValidPin(pin ?? typed))

  function approve(): void {
    if (!ready) return
    void send(pin === null ? { type: 'APPROVE', pin: typed } : { type: 'APPROVE' })
  }
</script>

<div class="badge" aria-hidden="true">
  <svg
    width="36"
    height="36"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="9" y="10" width="30" height="21" rx="3.5" /><path d="M4 37h40" />
  </svg>
</div>
<div class="stack gap-sm">
  <h1 class="title title-md">{copy.title}</h1>
  <p class="subtitle">{copy.subtitle}</p>
</div>
{#if pin === null}
  <div class="stack gap-xs">
    <label class="hint" for="pin">Digite o PIN que aparece no outro computador</label>
    <input
      id="pin"
      class="pin-input"
      inputmode="numeric"
      autocomplete="off"
      maxlength="4"
      value={typed}
      oninput={(event) => {
        // Regrava o campo: se o texto limpo for igual ao anterior, o Svelte não atualizaria a tela.
        const clean = event.currentTarget.value.replace(/\D/g, '').slice(0, 4)
        event.currentTarget.value = clean
        typed = clean
      }}
      onkeydown={(event) => event.key === 'Enter' && approve()}
    />
  </div>
{/if}
<div class="stack gap-xs">
  <button class="btn btn-primary" disabled={!ready} onclick={approve}>Permitir</button>
  <button class="btn btn-ghost" onclick={() => send({ type: 'DENY' })}>Recusar</button>
</div>
<span class="hint-faint">{safeName(device)} · mesma rede</span>
