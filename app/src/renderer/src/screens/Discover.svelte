<script lang="ts" module>
  /** Conectar sozinho só na primeira busca depois de abrir o app: depois de Parar, ninguém conecta por conta própria. */
  let autoTried = false
</script>

<script lang="ts">
  import VideoHint from '../components/VideoHint.svelte'
  import SetupNotice from '../components/SetupNotice.svelte'
  import { L } from '../lib/i18n'
  import DeviceIcon from '../components/DeviceIcon.svelte'
  import { guessKind } from '../../../shared/device'
  import { onMount } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fade, fly } from 'svelte/transition'
  import { ms } from '../lib/motion'
  import type { Host } from '../../../shared/types'
  import { copyFor, safeName } from '../lib/copy'
  import { send } from '../lib/actions'
  import { pollHosts, rememberedHost } from '../lib/hosts'
  import { isHostAddress } from '../../../shared/address'

  let { lastHost = null }: { lastHost?: string | null } = $props()
  const copy = copyFor({ screen: 'discover', mode: 'receive' })
  let hosts = $state<Host[]>([])
  let searching = $state(true)

  let manual = $state(false)
  let address = $state('')
  const valid = $derived(isHostAddress(address.trim()))

  // Procura de novo a cada poucos segundos: uma busca só deixava a lista vazia para sempre se falhasse.
  onMount(() => {
    const stop = pollHosts(window.horizonte.listHosts, (found, stillSearching) => {
      hosts = found
      searching = stillSearching
      const last = autoTried ? undefined : rememberedHost(found, lastHost)
      if (last) {
        autoTried = true
        send({ type: 'CONNECT', host: last.address, name: safeName(last.name) })
      }
    })
    return () => {
      autoTried = true
      stop()
    }
  })

  function connectByAddress(): void {
    const host = address.trim()
    if (isHostAddress(host)) send({ type: 'CONNECT', host, name: host })
  }
</script>

<div class="hosts">
  <h1 class="title">{copy.title}</h1>
  <div class="hosts-list" aria-live="polite">
    {#each hosts as host (host.address)}
      <button
        class="host"
        aria-label={`${L({ pt: 'Conectar a', en: 'Connect to', es: 'Conectar a' })} ${safeName(host.name)} (${host.address})`}
        animate:flip={{ duration: ms(240) }}
        in:fly={{ y: 8, duration: ms(260) }}
        out:fade={{ duration: ms(120) }}
        onclick={() => send({ type: 'CONNECT', host: host.address, name: safeName(host.name) })}
      >
        <span class="host-icon">
          <DeviceIcon kind={host.kind ?? guessKind(host.name)} />
        </span>
        <span class="host-body">
          <span class="host-name">{safeName(host.name)}</span>
          <span class="host-addr">{host.address}</span>
        </span>
        <span class="chevron" aria-hidden="true"></span>
      </button>
    {/each}
  </div>
  <div class="stack gap-xs">
    <div role="status">
      {#if searching}
        <span class="searching">{L({ pt: 'Procurando…', en: 'Searching…', es: 'Buscando…' })}</span>
      {:else if hosts.length === 0}
        <span class="searching"
          >{L({
            pt: 'Nada por aqui. No outro computador, abra o Horizonte em Enviar.',
            en: 'Nothing here. On the other computer, open Horizonte on Send.',
            es: 'Nada por aquí. En la otra computadora, abre Horizonte en Enviar.'
          })}</span
        >
      {/if}
    </div>
    <!-- A busca na rede também passa pelo firewall: bloqueado ou em rede Pública, a lista fica vazia. -->
    <SetupNotice role="receive" />
    {#if manual}
      <form
        class="manual"
        onsubmit={(event) => {
          event.preventDefault()
          connectByAddress()
        }}
      >
        <input
          class="text-input manual-input"
          aria-label={L({
            pt: 'Endereço do outro aparelho',
            en: 'Address of the other device',
            es: 'Dirección del otro dispositivo'
          })}
          placeholder="192.168.1.5"
          autocomplete="off"
          spellcheck="false"
          bind:value={address}
        />
        <button class="btn btn-primary btn-sm" type="submit" disabled={!valid}
          >{L({ pt: 'Conectar', en: 'Connect', es: 'Conectar' })}</button
        >
      </form>
    {:else}
      <button class="link" onclick={() => (manual = true)}
        >{L({
          pt: 'Adicionar pelo endereço',
          en: 'Add by address',
          es: 'Agregar por dirección'
        })}</button
      >
    {/if}
  </div>
</div>
<VideoHint />
