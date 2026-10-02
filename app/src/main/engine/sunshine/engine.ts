import type { PrepStep, Settings } from '../../../shared/types'
import { chooseEncoder, GPU_ENCODERS, type ChosenEncoder } from '../../core/encoder'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../../platform/types'
import type { PairRequest, ServerEngine } from '../port'
import { SunshineApiError, type SunshineApiPort } from './api'
import { amdConfig, createLogEncoderProbe } from './encoder-probe'
import { parseDisplays } from './log'
import type { EngineMemory } from './memory'
import { createRestarter } from './restart'

export interface SunshineEngineDeps {
  installer: EngineInstaller
  display: VirtualDisplay
  memory: EngineMemory
  credentials(): Promise<SunshineCredentials>
  createApi(credentials: SunshineCredentials): SunshineApiPort
  readLog(): Promise<string>
  sleep(ms: number): Promise<void>
  timing?: {
    reachableTimeoutMs?: number
    pollMs?: number
    restartTimeoutMs?: number
    probeTimeoutMs?: number
    pairingIntervalMs?: number
    sessionIntervalMs?: number
  }
}

type Listeners<A extends unknown[]> = Set<(...args: A) => void>

function friendly(cause: unknown): Error {
  if (cause instanceof SunshineApiError) {
    if (cause.kind === 'unauthorized') {
      return new Error('O Sunshine recusou o usuário ou a senha. Confira as credenciais.')
    }
    return new Error(cause.message)
  }
  return cause instanceof Error ? cause : new Error(String(cause))
}

/** Papel de servidor: prepara o Sunshine (monitor virtual e encoder), cuida do pareamento e da sessão. */
export class SunshineEngine implements ServerEngine {
  protected api: SunshineApiPort | null = null
  protected run = 0
  protected readonly pairListeners: Listeners<[PairRequest]> = new Set()
  protected readonly cancelListeners: Listeners<[string]> = new Set()
  protected readonly connectedListeners: Listeners<[string]> = new Set()
  protected readonly disconnectedListeners: Listeners<[]> = new Set()

  constructor(protected readonly deps: SunshineEngineDeps) {}

  private get timing(): Required<NonNullable<SunshineEngineDeps['timing']>> {
    const t = this.deps.timing ?? {}
    return {
      reachableTimeoutMs: t.reachableTimeoutMs ?? 30_000,
      pollMs: t.pollMs ?? 500,
      restartTimeoutMs: t.restartTimeoutMs ?? 45_000,
      probeTimeoutMs: t.probeTimeoutMs ?? 60_000,
      pairingIntervalMs: t.pairingIntervalMs ?? 2000,
      sessionIntervalMs: t.sessionIntervalMs ?? 1000
    }
  }

  async prepare(onStep: (step: PrepStep) => void, settings: Settings): Promise<void> {
    const run = ++this.run
    const alive = (): boolean => run === this.run
    this.stopWatchers()

    onStep('engine')
    await this.deps.installer.ensureInstalled()
    if (!alive()) return
    const api = this.deps.createApi(await this.deps.credentials())
    this.api = api
    await this.waitUntilReachable(api, alive)
    if (!alive()) return

    onStep('display')
    await this.deps.display.ensureVirtualDisplay()
    if (!alive()) return
    const restartAndRead = this.restarter(api)
    const displayId = await this.findVirtualDisplay(restartAndRead, alive)
    if (!alive()) return

    onStep('encoder')
    const chosen = await this.resolveEncoder(api, restartAndRead, settings, alive)
    if (!alive()) return

    const changed = await this.ensureConfig(api, this.desiredConfig(settings, displayId, chosen))
    if (changed) await restartAndRead(alive)
    if (!alive()) return

    this.startWatchers()
  }

  private restarter(api: SunshineApiPort): (alive?: () => boolean) => Promise<string> {
    return createRestarter({
      api,
      readLog: this.deps.readLog,
      sleep: this.deps.sleep,
      timeoutMs: this.timing.restartTimeoutMs,
      pollMs: this.timing.pollMs
    })
  }

  private async waitUntilReachable(api: SunshineApiPort, alive: () => boolean): Promise<void> {
    const polls = Math.max(1, Math.ceil(this.timing.reachableTimeoutMs / this.timing.pollMs))
    for (let i = 0; i < polls; i++) {
      try {
        await api.getConfig()
        return
      } catch (cause) {
        if (cause instanceof SunshineApiError && cause.kind === 'unauthorized')
          throw friendly(cause)
        await this.deps.sleep(this.timing.pollMs)
        if (!alive()) return
      }
    }
    throw new Error('O Sunshine não respondeu. Confira se ele está instalado e aberto.')
  }

  private async findVirtualDisplay(
    restartAndRead: (alive?: () => boolean) => Promise<string>,
    alive: () => boolean
  ): Promise<string> {
    const find = (log: string): string | null =>
      parseDisplays(log).find((display) => this.deps.display.isVirtual(display))?.deviceId ?? null

    let id = find(await this.deps.readLog())
    if (id === null) {
      // O log atual pode ser de uma execução que não listou os monitores: reinicia para ver a lista.
      const log = await restartAndRead(alive)
      if (!alive()) return ''
      id = find(log)
    }
    if (id === null) throw new Error('Não achei o monitor virtual no Sunshine.')
    return id
  }

  private async resolveEncoder(
    api: SunshineApiPort,
    restartAndRead: (alive?: () => boolean) => Promise<string>,
    settings: Settings,
    alive: () => boolean
  ): Promise<ChosenEncoder | null> {
    if (settings.encoding === 'cpu') return null
    const remembered = await this.deps.memory.load()
    if (remembered !== null) {
      const candidate = GPU_ENCODERS.find((item) => item.id === remembered.encoder)
      return candidate ? { candidate, fellBack: false } : null
    }
    const probe = createLogEncoderProbe({ api, restartAndRead: (a) => restartAndRead(a ?? alive) })
    const chosen = await chooseEncoder(probe, settings.encoding, this.timing.probeTimeoutMs)
    if (!alive()) return null
    // Só lembramos de verdade o que foi confirmado; "nenhum" também é lembrado para não reiniciar à toa.
    await this.deps.memory.save({ encoder: chosen.fellBack ? null : chosen.candidate.id })
    return chosen.fellBack ? null : chosen
  }

  private desiredConfig(
    settings: Settings,
    displayId: string,
    chosen: ChosenEncoder | null
  ): Record<string, string> {
    const base = { sunshine_name: settings.deviceName, output_name: displayId }
    if (settings.encoding === 'cpu') return { ...base, encoder: 'software' }
    // Sem confirmação de GPU deixamos o Sunshine decidir sozinho (ele cai para software se precisar).
    const candidate = chosen?.candidate ?? GPU_ENCODERS[0]!
    return { ...base, encoder: '', ...amdConfig(candidate) }
  }

  /** Grava só o que mudou. Devolve verdadeiro se mudou algo (e portanto precisa reiniciar). */
  private async ensureConfig(
    api: SunshineApiPort,
    desired: Record<string, string>
  ): Promise<boolean> {
    const current = await api.getConfig()
    const diff = Object.fromEntries(
      Object.entries(desired).filter(([key, value]) => String(current[key] ?? '') !== value)
    )
    if (Object.keys(diff).length === 0) return false
    await api.saveConfig(diff)
    return true
  }

  // As partes abaixo são da Tarefa 10.
  protected startWatchers(): void {
    // implementado na Tarefa 10
  }

  protected stopWatchers(): void {
    // implementado na Tarefa 10
  }

  async abort(): Promise<void> {
    this.run++
    this.stopWatchers()
  }

  async approve(): Promise<void> {
    throw new Error('Ainda não implementado.')
  }

  async deny(): Promise<void> {
    throw new Error('Ainda não implementado.')
  }

  async stopSending(): Promise<void> {
    throw new Error('Ainda não implementado.')
  }

  async applyBitrate(): Promise<void> {
    // implementado na Tarefa 10
  }

  onPairRequest(callback: (request: PairRequest) => void): () => void {
    this.pairListeners.add(callback)
    return () => void this.pairListeners.delete(callback)
  }

  onPairCancelled(callback: (pairingId: string) => void): () => void {
    this.cancelListeners.add(callback)
    return () => void this.cancelListeners.delete(callback)
  }

  onClientConnected(callback: (device: string) => void): () => void {
    this.connectedListeners.add(callback)
    return () => void this.connectedListeners.delete(callback)
  }

  onClientDisconnected(callback: () => void): () => void {
    this.disconnectedListeners.add(callback)
    return () => void this.disconnectedListeners.delete(callback)
  }
}
