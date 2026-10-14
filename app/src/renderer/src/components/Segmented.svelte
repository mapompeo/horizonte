<script lang="ts">
  interface Props {
    label: string
    options: { value: string | number; text: string; sub?: string }[]
    value: string | number
    onSelect: (value: string | number) => void
    /** Largura natural (topo da janela) em vez de ocupar a linha toda. */
    compact?: boolean
  }

  let { label, options, value, onSelect, compact = false }: Props = $props()

  const index = $derived(options.findIndex((option) => option.value === value))
  const tall = $derived(options.some((option) => option.sub))
</script>

<div
  class="seg"
  class:seg-wide={!compact}
  class:seg-tall={tall}
  role="group"
  aria-label={label}
  style="--n: {options.length}; --i: {index}"
>
  <!-- Valor fora das opções (um Personalizado, por exemplo): nada fica selecionado. -->
  <span class="seg-thumb" class:seg-thumb-off={index < 0} aria-hidden="true"></span>
  {#each options as option (option.value)}
    <button
      class="seg-item"
      class:on={option.value === value}
      aria-pressed={option.value === value}
      onclick={() => onSelect(option.value)}
    >
      {option.text}
      {#if option.sub}<span class="seg-sub">{option.sub}</span>{/if}
    </button>
  {/each}
</div>
