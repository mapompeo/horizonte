<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from '../lib/i18n'
  import { PROFILES } from '../../../shared/quality'
  import type {
    ConnectedDevice,
    Fps,
    Language,
    LinkQuality,
    Settings,
    Theme
  } from '../../../shared/types'
  import { mapScreens } from '../lib/map-screens'
  import { chooseMode, closeSettings, patchSettings } from '../lib/actions'
  import PlacementMap from '../components/PlacementMap.svelte'
  import ReportButton from '../components/ReportButton.svelte'
  import Segmented from '../components/Segmented.svelte'
  import Toggle from '../components/Toggle.svelte'
  import UpdateControls from '../components/UpdateControls.svelte'
  import UninstallControls from '../components/UninstallControls.svelte'

  interface Props {
    settings: Settings
    /** Aparelhos conectados agora: o mapa de posição mostra eles, como na tela de conectados. */
    devices?: ConnectedDevice[]
    links?: Record<string, LinkQuality>
  }

  let { settings, devices = [], links = {} }: Props = $props()
  const connected = $derived(
    mapScreens(devices, settings.screenPlacements, settings.screenPlacement, links)
  )

  /** Só onde o atalho vale de verdade (no Wayland, não). */
  let shortcut = $state<string | null>(null)
  onMount(
    () =>
      void window.horizonte
        .shortcut()
        .then((label) => (shortcut = label))
        .catch(() => undefined)
  )

  const tiles = [
    {
      id: 'economico',
      name: L({ pt: 'Econômico', en: 'Economy', es: 'Económico' }),
      mbps: PROFILES.economico
    },
    {
      id: 'equilibrado',
      name: L({ pt: 'Equilibrado', en: 'Balanced', es: 'Equilibrado' }),
      mbps: PROFILES.equilibrado
    },
    { id: 'maximo', name: L({ pt: 'Máximo', en: 'Maximum', es: 'Máximo' }), mbps: PROFILES.maximo }
  ] as const
  /** Tamanho de quem ainda não conectou desde que passou a ser guardado: o real chega na próxima conexão. */
  const UNKNOWN_SCREEN = { width: 1920, height: 1080 }
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && closeSettings()} />

<div class="sheet">
  <header class="sheet-head">
    <button class="back" onclick={closeSettings}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg
      >
      {L({ pt: 'Voltar', en: 'Back', es: 'Volver' })}
    </button>
    <h1 class="sheet-title">{L({ pt: 'Ajustes', en: 'Settings', es: 'Ajustes' })}</h1>
    <span></span>
  </header>

  <div class="sheet-body">
    <section class="group" aria-labelledby="g-general">
      <h2 class="group-label" id="g-general">{L({ pt: 'Geral', en: 'General', es: 'General' })}</h2>
      <div class="card">
        <div class="row">
          <span>{L({ pt: 'Idioma', en: 'Language', es: 'Idioma' })}</span>
          <Segmented
            compact
            label={L({ pt: 'Idioma', en: 'Language', es: 'Idioma' })}
            value={settings.language}
            options={[
              { value: 'system', text: L({ pt: 'Sistema', en: 'System', es: 'Sistema' }) },
              { value: 'pt', text: 'Português' },
              { value: 'en', text: 'English' },
              { value: 'es', text: 'Español' }
            ]}
            onSelect={(value) => patchSettings({ language: value as Language })}
          />
        </div>
        <div class="row">
          <span>{L({ pt: 'Aparência', en: 'Appearance', es: 'Apariencia' })}</span>
          <Segmented
            compact
            label={L({ pt: 'Tema', en: 'Theme', es: 'Tema' })}
            value={settings.theme}
            options={[
              { value: 'system', text: L({ pt: 'Sistema', en: 'System', es: 'Sistema' }) },
              { value: 'light', text: L({ pt: 'Claro', en: 'Light', es: 'Claro' }) },
              { value: 'dark', text: L({ pt: 'Escuro', en: 'Dark', es: 'Oscuro' }) }
            ]}
            onSelect={(value) => patchSettings({ theme: value as Theme })}
          />
        </div>
      </div>
    </section>

    <section class="group" aria-labelledby="g-quality">
      <h2 class="group-label" id="g-quality">{L({ pt: 'Imagem', en: 'Picture', es: 'Imagen' })}</h2>
      <div class="card">
        <div class="row">
          <span>{L({ pt: 'Qualidade', en: 'Quality', es: 'Calidad' })}</span>
          <Segmented
            compact
            label={L({ pt: 'Qualidade', en: 'Quality', es: 'Calidad' })}
            value={settings.profile}
            options={tiles.map((tile) => ({ value: tile.id, text: tile.name }))}
            onSelect={(id) => {
              const tile = tiles.find((option) => option.id === id)
              if (tile) void patchSettings({ bitrate: tile.mbps })
            }}
          />
        </div>
        <div class="row">
          <span>{L({ pt: 'Fluidez', en: 'Smoothness', es: 'Fluidez' })}</span>
          <Segmented
            compact
            label={L({ pt: 'Fluidez', en: 'Smoothness', es: 'Fluidez' })}
            value={settings.fps}
            options={[
              { value: 30, text: '30 fps' },
              { value: 60, text: '60 fps' },
              { value: 120, text: '120 fps' }
            ]}
            onSelect={(value) => patchSettings({ fps: value as Fps })}
          />
        </div>
      </div>
    </section>

    <section class="group" aria-labelledby="g-place">
      <h2 class="group-label" id="g-place">
        {L({ pt: 'Posição da tela', en: 'Screen position', es: 'Posición de la pantalla' })}
      </h2>
      <div class="card card-pad">
        <!-- Com aparelho conectado, o mesmo mapa da tela de conectados; sem nenhum, a posição padrão dos próximos. -->
        <PlacementMap
          screens={connected.length
            ? connected
            : [
                {
                  key: '*',
                  name: L({
                    pt: 'Tela estendida',
                    en: 'Extended screen',
                    es: 'Pantalla extendida'
                  }),
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
      <h2 class="group-label" id="g-computer">
        {L({ pt: 'Este computador', en: 'This computer', es: 'Esta computadora' })}
      </h2>
      <div class="card">
        <div class="row">
          <span>{L({ pt: 'Nome', en: 'Name', es: 'Nombre' })}</span>
          <span class="row-value">{settings.deviceName}</span>
        </div>
        <div class="row">
          <span
            >{L({
              pt: 'Abrir com o sistema',
              en: 'Open at login',
              es: 'Abrir con el sistema'
            })}</span
          >
          <Toggle
            label={L({
              pt: 'Abrir com o sistema',
              en: 'Open at login',
              es: 'Abrir con el sistema'
            })}
            checked={settings.autostart}
            onChange={(checked) => patchSettings({ autostart: checked })}
          />
        </div>
        {#if shortcut}
          <div class="row">
            <span
              >{L({
                pt: 'Trazer esta janela de qualquer lugar',
                en: 'Bring this window from anywhere',
                es: 'Traer esta ventana desde cualquier lugar'
              })}</span
            >
            <kbd class="row-value">{shortcut}</kbd>
          </div>
        {/if}
        <button
          class="row row-button"
          onclick={() => {
            closeSettings()
            chooseMode('mouse')
          }}
          >{L({
            pt: 'Compartilhar o mouse',
            en: 'Share the mouse',
            es: 'Compartir el mouse'
          })}</button
        >
      </div>
    </section>

    {#if settings.trusted.length > 0}
      <section class="group" aria-labelledby="g-trusted">
        <h2 class="group-label" id="g-trusted">
          {L({ pt: 'Aparelhos permitidos', en: 'Allowed devices', es: 'Dispositivos permitidos' })}
        </h2>
        <div class="card">
          {#each settings.trusted as device (device.name + device.address)}
            <div class="row">
              <span>{device.name}</span>
              <button
                class="row-action danger"
                onclick={() =>
                  patchSettings({
                    trusted: settings.trusted.filter(
                      (known) => known.name !== device.name || known.address !== device.address
                    )
                  })}>{L({ pt: 'Esquecer', en: 'Forget', es: 'Olvidar' })}</button
              >
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="group" aria-labelledby="g-about">
      <h2 class="group-label" id="g-about">{L({ pt: 'Sobre', en: 'About', es: 'Acerca de' })}</h2>
      <div class="card">
        <UpdateControls />
        <ReportButton class="row row-button" />
        <button class="row row-button" onclick={() => window.horizonte.openRepo()}
          >{L({ pt: 'Código no GitHub', en: 'Code on GitHub', es: 'Código en GitHub' })}</button
        >
      </div>
    </section>

    <section
      class="group"
      aria-label={L({ pt: 'Desinstalar', en: 'Uninstall', es: 'Desinstalar' })}
    >
      <div class="card">
        <UninstallControls />
      </div>
    </section>
  </div>
</div>
