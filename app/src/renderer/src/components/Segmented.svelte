<script lang="ts">
  interface Props {
    label: string
    options: { value: string | number; text: string }[]
    value: string | number
    onSelect: (value: string | number) => void
  }

  let { label, options, value, onSelect }: Props = $props()
</script>

<div class="seg seg-wide" role="group" aria-label={label}>
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
