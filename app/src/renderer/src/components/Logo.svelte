<script lang="ts">
  import icone from '../assets/logo/horizonte-icone.svg'

  /** O ícone do app, o mesmo da dock e do site (docs/identidade). */
  let { size = 64 }: { size?: number } = $props()
</script>

<img class="logo" src={icone} width={size} height={size} alt="" />
