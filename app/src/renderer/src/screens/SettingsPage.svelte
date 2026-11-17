<script lang="ts">
  import { PROFILES } from '../../../shared/quality'
  import type { Fps, Settings } from '../../../shared/types'
  import { closeSettings, patchSettings } from '../lib/actions'
  import CopyButton from '../components/CopyButton.svelte'
  import PlacementMap from '../components/PlacementMap.svelte'
  import ReportButton from '../components/ReportButton.svelte'
  import Segmented from '../components/Segmented.svelte'
  import Toggle from '../components/Toggle.svelte'
  import UpdateControls from '../components/UpdateControls.svelte'
  import UninstallControls from '../components/UninstallControls.svelte'

  interface Props {
    settings: Settings
  }

  let { settings }: Props = $props()

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
  /** Tamanho de quem ainda não conectou desde que passou a ser guardado: o real chega na próxima conexão. */
  const UNKNOWN_SCREEN = { width: 1920, height: 1080 }
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
      <Segmented
        label="Qualidade"
        value={settings.profile}
        options={tiles.map((tile) => ({ value: tile.id, text: tile.name }))}
        onSelect={(id) => {
          const tile = tiles.find((option) => option.id === id)
          if (tile) void patchSettings({ bitrate: tile.mbps })
        }}
      />
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
    </section>

    <section class="group" aria-labelledby="g-computer">
      <h2 class="group-label" id="g-computer">Este dispositivo</h2>
      <div class="card">
        <div class="row">
          <span>Abrir com o sistema</span>
          <Toggle
            label="Abrir com o sistema"
            checked={settings.autostart}
            onChange={(checked) => patchSettings({ autostart: checked })}
          />
        </div>
        {#each settings.trusted as device (device.name + device.address)}
          <div class="row">
            <span>{device.name} <span class="row-value">· confiável</span></span>
            <button
              class="row-action"
              onclick={() =>
                patchSettings({
                  trusted: settings.trusted.filter(
                    (known) => known.name !== device.name || known.address !== device.address
                  )
                })}>Esquecer</button
            >
          </div>
        {/each}
        <div class="row">
          <span>Nome deste dispositivo</span>
          <span class="row-value">{settings.deviceName}</span>
        </div>
      </div>
    </section>

    <section class="group" aria-labelledby="g-advanced">
      <h2 class="group-label" id="g-advanced">Avançado</h2>
      <div class="card">
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
      </div>
    </section>

    <section class="group" aria-labelledby="g-place">
      <h2 class="group-label" id="g-place">Posição da tela estendida</h2>
      <div class="card">
        <div class="adv-block">
          <PlacementMap
            screens={[
              {
                key: '*',
                name: 'Tela estendida',
                screen:
                  settings.trusted.findLast((device) => device.screen)?.screen ?? UNKNOWN_SCREEN,
                placement: settings.screenPlacement
              }
            ]}
            placements={settings.screenPlacements}
            height={200}
          />
        </div>
      </div>
      <p class="adv-note">Arraste para posicionar. Vale para quem ainda não tem posição própria.</p>
    </section>

    <section class="group" aria-labelledby="g-about">
      <h2 class="group-label" id="g-about">Sobre</h2>
      <div class="card">
        <ReportButton class="row row-button" />
        <CopyButton class="row row-button" />
        <button class="row row-button" onclick={() => window.horizonte.openRepo()}
          >Código no GitHub</button
        >
        <UninstallControls />
      </div>
    </section>

    <UpdateControls />
  </div>
</div>
