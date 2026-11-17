<script lang="ts">
  import { PROFILES } from '../../../shared/quality'
  import type { Fps, Settings, Theme } from '../../../shared/types'
  import { chooseMode, closeSettings, patchSettings } from '../lib/actions'
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
    <section class="group" aria-labelledby="g-look">
      <h2 class="group-label" id="g-look">Aparência</h2>
      <Segmented
        label="Tema"
        value={settings.theme}
        options={[
          { value: 'system', text: 'Sistema' },
          { value: 'light', text: 'Claro' },
          { value: 'dark', text: 'Escuro' }
        ]}
        onSelect={(value) => patchSettings({ theme: value as Theme })}
      />
    </section>

    <section class="group" aria-labelledby="g-quality">
      <h2 class="group-label" id="g-quality">Imagem</h2>
      <Segmented
        label="Qualidade"
        value={settings.profile}
        options={tiles.map((tile) => ({ value: tile.id, text: tile.name }))}
        onSelect={(id) => {
          const tile = tiles.find((option) => option.id === id)
          if (tile) void patchSettings({ bitrate: tile.mbps })
        }}
      />
      <Segmented
        label="Quadros por segundo"
        value={settings.fps}
        options={[
          { value: 30, text: '30 qps' },
          { value: 60, text: '60 qps' },
          { value: 120, text: '120 qps' }
        ]}
        onSelect={(value) => patchSettings({ fps: value as Fps })}
      />
    </section>

    <section class="group" aria-labelledby="g-place">
      <h2 class="group-label" id="g-place">Posição da tela</h2>
      <div class="card card-pad">
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
          height={180}
        />
      </div>
    </section>

    <section class="group" aria-labelledby="g-computer">
      <h2 class="group-label" id="g-computer">Este computador</h2>
      <div class="card">
        <div class="row">
          <span>Nome</span>
          <span class="row-value">{settings.deviceName}</span>
        </div>
        <div class="row">
          <span>Abrir com o sistema</span>
          <Toggle
            label="Abrir com o sistema"
            checked={settings.autostart}
            onChange={(checked) => patchSettings({ autostart: checked })}
          />
        </div>
        <button
          class="row row-button"
          onclick={() => {
            closeSettings()
            chooseMode('mouse')
          }}>Usar o mouse em outro computador</button
        >
        {#each settings.trusted as device (device.name + device.address)}
          <div class="row">
            <span>{device.name}</span>
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
      </div>
    </section>

    <UpdateControls />

    <section class="group" aria-label="Mais">
      <div class="card">
        <ReportButton class="row row-button" />
        <button class="row row-button" onclick={() => window.horizonte.openRepo()}
          >Código aberto no GitHub</button
        >
        <UninstallControls />
      </div>
    </section>
  </div>
</div>
