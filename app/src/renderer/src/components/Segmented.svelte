<script lang="ts">
  interface Props {
    label: string
    options: { value: string | number; text: string }[]
    value: string | number
    onSelect: (value: string | number) => void
    /** Largura natural (topo da janela) em vez de ocupar a linha toda. */
    compact?: boolean
  }

  let { label, options, value, onSelect, compact = false }: Props = $props()

  const index = $derived(options.findIndex((option) => option.value === value))
</script>

<div
  class="seg"
  class:seg-wide={!compact}
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
    </button>
  {/each}
</div>
