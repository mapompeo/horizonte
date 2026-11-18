<script lang="ts">
  import { onMount } from 'svelte'
  import type { FirewallState, MacAccess } from '../../../shared/api'
  import { setupNotices, type SetupNotice } from '../lib/setup-notices'

  /**
   * Liberações de primeiro uso (firewall, Gravação de Tela, Acessibilidade): um aviso por vez, o mais importante.
   * Confere de novo quando a janela volta ao foco (depois da pergunta do sistema ou dos Ajustes).
   */
  let { role = 'send' }: { role?: 'send' | 'receive' } = $props()

  let firewall = $state<FirewallState | null>(null)
  let macAccess = $state<MacAccess | null>(null)
  const check = async (): Promise<void> => {
    ;[firewall, macAccess] = await Promise.all([
      window.horizonte.firewall().catch(() => null),
      window.horizonte.macAccess().catch(() => null)
    ])
  }
  onMount(() => void check())
  const notice = $derived(setupNotices(window.horizonte.platform, firewall, macAccess, role)[0])
  let acting = $state(false)
  async function act(kind: NonNullable<SetupNotice['action']>['kind']): Promise<void> {
    acting = true
    if (kind === 'allow-firewall')
      firewall = await window.horizonte.allowFirewall().catch(() => firewall)
    else await window.horizonte.openPrivacy(kind === 'open-screen' ? 'screen' : 'accessibility')
    acting = false
  }
</script>

<svelte:window onfocus={() => notice && void check()} />
{#if notice}
  <span class="notice"
    >{#each notice.text.split('**') as part, i (i)}{#if i % 2}<b>{part}</b
        >{:else}{part}{/if}{/each}</span
  >
  {#if notice.action}
    {@const action = notice.action}
    <button class="link" disabled={acting} onclick={() => act(action.kind)}>{action.label}</button>
  {/if}
{/if}
