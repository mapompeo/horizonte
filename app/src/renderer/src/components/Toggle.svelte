<script lang="ts">
  interface Props {
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
  }

  let { label, checked, onChange }: Props = $props()
</script>

<button
  class="switch"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={() => onChange(!checked)}
>
  <span class="switch-thumb"></span>
</button>
