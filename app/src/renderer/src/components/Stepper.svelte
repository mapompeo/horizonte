<script lang="ts">
  import { stepBitrate } from '../../../shared/quality'

  interface Props {
    bitrate: number
    onChange: (mbps: number) => void
  }

  let { bitrate, onChange }: Props = $props()
</script>

<div class="stepper">
  <button
    class="round"
    aria-label="Diminuir qualidade"
    onclick={() => onChange(stepBitrate(bitrate, -1))}>−</button
  >
  <div class="stepper-value">
    <span class="stepper-num">{bitrate} Mbps</span>
    <span class="stepper-cap">Qualidade</span>
  </div>
  <button
    class="round"
    aria-label="Aumentar qualidade"
    onclick={() => onChange(stepBitrate(bitrate, 1))}>+</button
  >
</div>
