<script lang="ts">
  import { L } from '../lib/i18n'
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
    aria-label={L({ pt: 'Diminuir qualidade', en: 'Lower quality', es: 'Bajar calidad' })}
    onclick={() => onChange(stepBitrate(bitrate, -1))}>−</button
  >
  <div class="stepper-value">
    <span class="stepper-num">{bitrate} Mbps</span>
    <span class="stepper-cap">{L({ pt: 'Qualidade', en: 'Quality', es: 'Calidad' })}</span>
  </div>
  <button
    class="round"
    aria-label={L({ pt: 'Aumentar qualidade', en: 'Raise quality', es: 'Subir calidad' })}
    onclick={() => onChange(stepBitrate(bitrate, 1))}>+</button
  >
</div>
