<script lang="ts">
  import { PROFILES } from '../../../shared/quality'
  import type {
    Codec,
    Encoding,
    ExtendSide,
    Fps,
    Resolution,
    Settings
  } from '../../../shared/types'
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
  /** Aparelho com o mapa de posição aberto (pela impressão digital). */
  let placing = $state<string | null>(null)
  /** Motor próprio: sem os ajustes que só valiam para o Sunshine. */
  const webrtc = window.horizonte.engine === 'webrtc'
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
      <p class="adv-note">
        Em Wi-Fi 5 GHz, de 30 a 50 Mbps costuma ficar nítido. Mais que isso pode travar.
      </p>
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
        {#if window.horizonte.platform !== 'darwin' && !webrtc}
          <div class="adv-block">
            <span class="adv-label">Posição da tela estendida</span>
            <Segmented
              label="Posição da tela estendida"
              value={settings.extendSide}
              options={[
                { value: 'left', text: 'Esquerda' },
                { value: 'above', text: 'Acima' },
                { value: 'right', text: 'Direita' }
              ]}
              onSelect={(value) => patchSettings({ extendSide: value as ExtendSide })}
            />
          </div>
        {/if}
        {#each settings.trusted as device (device.name + device.address)}
          <div class="row">
            <span>{device.name} <span class="row-value">· confiável</span></span>
            {#if webrtc && device.fingerprint}
              <button
                class="foot-link"
                aria-expanded={placing === device.fingerprint}
                onclick={() =>
                  (placing = placing === device.fingerprint ? null : (device.fingerprint ?? null))}
                >{placing === device.fingerprint ? 'Pronto' : 'Posição'}</button
              >
            {/if}
            <button
              class="foot-link"
              onclick={() =>
                patchSettings({
                  trusted: settings.trusted.filter(
                    (known) => known.name !== device.name || known.address !== device.address
                  )
                })}>Esquecer</button
            >
          </div>
          {#if placing && placing === device.fingerprint}
            <div class="adv-block">
              <PlacementMap
                device={device.name}
                fingerprint={placing}
                peerScreen={device.screen ?? UNKNOWN_SCREEN}
                placements={settings.screenPlacements}
                fallback={settings.extendSide}
                height={200}
              />
              <p class="adv-note">
                Arraste a tela do {device.name} para onde ela fica na sua mesa. Vale na próxima conexão
                (ou na hora, se ele estiver conectado).
              </p>
            </div>
          {/if}
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
        {#if !webrtc}
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
        {/if}
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
        {#if webrtc}
          <p class="adv-note">
            A tela estendida tem o tamanho da tela de quem mostra, e o Horizonte usa a placa de
            vídeo quando ela está disponível.
          </p>
        {:else}
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
        {/if}
      </div>
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
