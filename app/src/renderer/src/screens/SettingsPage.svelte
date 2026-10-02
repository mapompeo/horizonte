<script lang="ts">
  import { PROFILES } from '../../../shared/quality'
  import type { Codec, Encoding, Fps, Resolution, Settings } from '../../../shared/types'
  import { closeSettings, patchSettings } from '../lib/actions'
  import Segmented from '../components/Segmented.svelte'
  import Toggle from '../components/Toggle.svelte'

  interface Props {
    settings: Settings
  }

  let { settings }: Props = $props()

  let advanced = $state(false)
  /** Valor do slider enquanto ele é arrastado; some assim que o ajuste é salvo. */
  let dragging = $state<number | null>(null)
  const shown = $derived(dragging ?? settings.bitrate)

  async function commitBitrate(): Promise<void> {
    try {
      if (dragging !== null) await patchSettings({ bitrate: dragging })
    } catch {
      // Se não deu para gravar, o slider volta ao valor salvo em vez de ficar preso no arrastado.
    } finally {
      dragging = null
    }
  }

  const tiles = [
    { id: 'economico', name: 'Econômico', mbps: PROFILES.economico },
    { id: 'equilibrado', name: 'Equilibrado', mbps: PROFILES.equilibrado },
    { id: 'maximo', name: 'Máximo', mbps: PROFILES.maximo }
  ] as const

  async function copyDiagnostic(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(settings, null, 2))
  }
</script>

<div class="sheet">
  <header class="sheet-head">
    <button class="back" onclick={closeSettings}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg
      >
      Voltar
    </button>
    <h1 class="sheet-title">Ajustes</h1>
    <span></span>
  </header>

  <div class="sheet-body">
    <section class="group" aria-labelledby="g-quality">
      <h2 class="group-label" id="g-quality">Qualidade</h2>
      <div class="tiles">
        {#each tiles as tile (tile.id)}
          <button
            class="tile"
            class:on={settings.profile === tile.id}
            aria-pressed={settings.profile === tile.id}
            onclick={() => patchSettings({ bitrate: tile.mbps })}
          >
            <span class="tile-name">{tile.name}</span>
            <span class="tile-sub">{tile.mbps} Mbps</span>
          </button>
        {/each}
      </div>
      <div class="card card-pad">
        <div class="range-row">
          <label for="bitrate">Personalizado</label><strong>{shown} Mbps</strong>
        </div>
        <input
          id="bitrate"
          type="range"
          min="5"
          max="80"
          value={shown}
          oninput={(event) => (dragging = Number(event.currentTarget.value))}
          onchange={commitBitrate}
        />
      </div>
      <p class="adv-note">
        Em Wi-Fi 5 GHz, de 30 a 50 Mbps costuma ficar nítido. Mais que isso pode travar.
      </p>
    </section>

    <section class="group" aria-labelledby="g-computer">
      <h2 class="group-label" id="g-computer">Este computador</h2>
      <div class="card">
        <div class="row">
          <span>Abrir com o sistema</span>
          <Toggle
            label="Abrir com o sistema"
            checked={settings.autostart}
            onChange={(checked) => patchSettings({ autostart: checked })}
          />
        </div>
        <div class="row">
          <label for="device-name">Nome</label>
          <input
            id="device-name"
            class="text-input"
            maxlength="40"
            value={settings.deviceName}
            onchange={(event) => patchSettings({ deviceName: event.currentTarget.value })}
          />
        </div>
      </div>
    </section>

    <section class="group">
      <button class="disclosure" aria-expanded={advanced} onclick={() => (advanced = !advanced)}>
        <span>Avançado</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--faint)"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={advanced ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {#if advanced}
        <div class="card">
          <div class="adv-block">
            <span class="adv-label">Resolução</span>
            <Segmented
              label="Resolução"
              value={settings.resolution}
              options={[
                { value: '720p', text: '720p' },
                { value: '1080p', text: '1080p' },
                { value: '1440p', text: '1440p' }
              ]}
              onSelect={(value) => patchSettings({ resolution: value as Resolution })}
            />
          </div>
          <div class="adv-block">
            <span class="adv-label">Quadros por segundo</span>
            <Segmented
              label="Quadros por segundo"
              value={settings.fps}
              options={[
                { value: 30, text: '30' },
                { value: 60, text: '60' },
                { value: 120, text: '120' }
              ]}
              onSelect={(value) => patchSettings({ fps: value as Fps })}
            />
          </div>
          <div class="adv-block">
            <span class="adv-label">Codificação</span>
            <Segmented
              label="Codificação"
              value={settings.encoding}
              options={[
                { value: 'auto', text: 'Automática' },
                { value: 'gpu', text: 'Placa de vídeo' },
                { value: 'cpu', text: 'Processador' }
              ]}
              onSelect={(value) => patchSettings({ encoding: value as Encoding })}
            />
            <p class="adv-note">
              Automática usa a placa de vídeo e cai para o processador se ela falhar.
            </p>
          </div>
          <div class="adv-block">
            <span class="adv-label">Codec</span>
            <Segmented
              label="Codec"
              value={settings.codec}
              options={[
                { value: 'h264', text: 'H.264' },
                { value: 'hevc', text: 'HEVC' },
                { value: 'av1', text: 'AV1' }
              ]}
              onSelect={(value) => patchSettings({ codec: value as Codec })}
            />
          </div>
        </div>
      {/if}
    </section>

    <div class="sheet-foot">
      <span>Horizonte 0.1.0</span>
      <button onclick={copyDiagnostic}>Copiar diagnóstico</button>
    </div>
  </div>
</div>
