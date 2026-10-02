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

  const index = $derived(
    Math.max(
      0,
      options.findIndex((option) => option.value === value)
    )
  )
</script>

<div
  class="seg"
  class:seg-wide={!compact}
  role="group"
  aria-label={label}
  style="--n: {options.length}; --i: {index}"
>
  <span class="seg-thumb" aria-hidden="true"></span>
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
