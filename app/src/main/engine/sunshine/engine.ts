import type { PinChannel } from '../pin-channel'
import type { PrepProgress, PrepStep, Settings } from '../../../shared/types'
import {
  chooseEncoder,
  GPU_ENCODERS,
  type ChosenEncoder,
  type EncoderCandidate
} from '../../core/encoder'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../../platform/types'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { cleanName } from '../../../shared/names'
import { isValidPin } from '../../../shared/pin'
import type { ApproveRequest, PairRequest, ServerEngine } from '../port'
import { SunshineApiError, type SunshineApiPort } from './api'
import { amdConfig, createLogEncoderProbe } from './encoder-probe'
import { parseDisplays, parseFoundEncoder } from './log'
import type { EngineMemory } from './memory'
import { createPairingWatcher, type PairingWatcher } from './pairing-watcher'
import { createRestarter } from './restart'
import { createSessionWatcher } from './session-watcher'

const GENERIC_DEVICE = 'Outro computador'

/** Quanto do caminho da preparação já passou quando o motor termina de ser instalado. */
const PROGRESS_AFTER_INSTALL = 0.55

export interface SunshineEngineDeps {
  installer: EngineInstaller
  display: VirtualDisplay
  memory: EngineMemory
  credentials(): Promise<SunshineCredentials>
  createApi(credentials: SunshineCredentials): SunshineApiPort
  readLog(): Promise<string>
  sleep(ms: number): Promise<void>
  /** Canal por onde o outro dispositivo manda o PIN do pareamento. Opcional. */
  pins?: PinChannel
  /**
   * Como reiniciar o motor. Por padrão pede pela API, mas no Windows essa chamada pode deixar o
   * processo preso; lá o reinício é feito pelo serviço do sistema.
   */
  restart?(): Promise<void>
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
      return new Error(
        'O motor de transmissão recusou o usuário ou a senha. Confira as credenciais.'
      )
    }
    return new Error(cause.message)
  }
  return cause instanceof Error ? cause : new Error(String(cause))
}

/** Papel de servidor: prepara o Sunshine (monitor virtual e encoder), cuida do pareamento e da sessão. */
export class SunshineEngine implements ServerEngine {
  protected api: SunshineApiPort | null = null
  protected run = 0
  private pairing: PairingWatcher | null = null
  private session: { start(): void; stop(): void } | null = null
  private lastApprovedName = GENERIC_DEVICE
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

  async prepare(
    onStep: (step: PrepStep) => void,
    settings: Settings,
    onProgress?: (progress: PrepProgress) => void
  ): Promise<void> {
    const run = ++this.run
    const alive = (): boolean => run === this.run
    this.stopWatchers()

    // Já preparado nesta sessão: só confere que o motor continua respondendo e que a configuração
    // não mudou. Nada de instalar, procurar monitor ou testar placa de novo.
    const known = this.known
    if (known !== null && this.api !== null && known.encoding === settings.encoding) {
      const api = this.api
      try {
        await api.getConfig()
        const changed = await this.ensureConfig(
          api,
          this.desiredConfig(settings, known.displayId, known.chosen)
        )
        if (changed) await this.restarter(api)(alive)
        if (!alive()) return
        this.startWatchers(api)
        return
      } catch {
        this.known = null // algo mudou por baixo: volta para a preparação completa
      }
    }

    // O caminho todo vai de 0 a 1: instalar o motor ocupa o começo, depois vêm o monitor e a placa.
    const report = (note: string, fraction: number): void => onProgress?.({ note, fraction })
    onStep('engine')
    await this.deps.installer.ensureInstalled((p) =>
      onProgress?.({ ...p, fraction: p.fraction * PROGRESS_AFTER_INSTALL })
    )
    if (!alive()) return
    report('Conectando ao motor de transmissão', PROGRESS_AFTER_INSTALL)
    const api = this.deps.createApi(await this.deps.credentials())
    this.api = api
    await this.waitUntilReachable(api, alive)
    if (!alive()) return

    onStep('display')
    report('Procurando o monitor virtual', PROGRESS_AFTER_INSTALL)
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

    this.known = { displayId, chosen, encoding: settings.encoding }
    this.startWatchers(api)
  }

  /** O que a última preparação completa descobriu; permite as próximas serem quase instantâneas. */
  private known: {
    displayId: string
    chosen: ChosenEncoder | null
    encoding: Settings['encoding']
  } | null = null

  private restarter(api: SunshineApiPort): (alive?: () => boolean) => Promise<string> {
    return createRestarter({
      api,
      restart: this.deps.restart,
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
    throw new Error('O motor de transmissão não respondeu. Confira se ele está instalado e aberto.')
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
    if (id === null) throw new Error('Não achei o monitor virtual no motor de transmissão.')
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
      return candidate ? { candidate, fellBack: false, inconclusive: false } : null
    }
    // Reiniciar o Sunshine é arriscado (já travou na instância real): se o log atual e a configuração
    // gravada já provam um encoder de hardware, usamos isso em vez de sondar reiniciando.
    const proven = await this.provenCandidate(api)
    if (proven !== null) {
      await this.deps.memory.save({ encoder: proven.id })
      return { candidate: proven, fellBack: false, inconclusive: false }
    }
    const probe = createLogEncoderProbe({
      api,
      restartAndRead: (stillWanted) => restartAndRead(() => alive() && (stillWanted?.() ?? true))
    })
    const chosen = await chooseEncoder(probe, settings.encoding, this.timing.probeTimeoutMs)
    if (!alive()) return null
    // "Nenhum" só é lembrado quando as sondagens responderam não; falha ou tempo esgotado não prova nada,
    // e gravar isso faria o app nunca mais tentar a GPU.
    if (!chosen.fellBack || !chosen.inconclusive) {
      await this.deps.memory.save({ encoder: chosen.fellBack ? null : chosen.candidate.id })
    }
    return chosen.fellBack ? null : chosen
  }

  private async provenCandidate(api: SunshineApiPort): Promise<EncoderCandidate | null> {
    if (parseFoundEncoder(await this.deps.readLog())?.hardware !== true) return null
    const usage = (await api.getConfig()).amd_usage
    return GPU_ENCODERS.find((candidate) => candidate.amdUsage === usage) ?? null
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
      Object.entries(desired).filter(([key, value]) => {
        if (String(current[key] ?? '') === value) return false
        // O nome padrão não vale um reinício: o Sunshine já usa o nome da máquina quando a chave falta.
        return !(
          key === 'sunshine_name' &&
          !(key in current) &&
          value === DEFAULT_SETTINGS.deviceName
        )
      })
    )
    if (Object.keys(diff).length === 0) return false
    await api.saveConfig(diff)
    return true
  }

  protected startWatchers(api: SunshineApiPort): void {
    this.stopWatchers()
    this.pairing = createPairingWatcher({
      api,
      intervalMs: this.timing.pairingIntervalMs,
      onRequest: (pairing) => {
        const device = cleanName(pairing.name) || GENERIC_DEVICE
        for (const listener of [...this.pairListeners])
          listener({ device, pairingId: pairing.id, pin: this.deps.pins?.take(device) })
      },
      onCancelled: (pairingId) => {
        for (const listener of [...this.cancelListeners]) listener(pairingId)
      }
    })
    this.session = createSessionWatcher({
      readLog: this.deps.readLog,
      intervalMs: this.timing.sessionIntervalMs,
      deviceName: () => this.lastApprovedName,
      onConnected: (device) => {
        for (const listener of [...this.connectedListeners]) listener(device)
      },
      onDisconnected: () => {
        for (const listener of [...this.disconnectedListeners]) listener()
      }
    })
    void this.deps.pins?.start().catch(() => undefined) // porta ocupada: cai para o PIN manual
    this.pairing.start()
    this.session.start()
  }

  protected stopWatchers(): void {
    void this.deps.pins?.stop()
    this.pairing?.stop()
    this.session?.stop()
    this.pairing = null
    this.session = null
  }

  private requireApi(): SunshineApiPort {
    if (this.api === null) throw new Error('O motor de transmissão não está pronto ainda.')
    return this.api
  }

  async abort(): Promise<void> {
    this.run++
    this.stopWatchers()
  }

  async approve(request: ApproveRequest): Promise<void> {
    const api = this.requireApi()
    if (!isValidPin(request.pin)) throw new Error('O PIN precisa ter 4 números.')
    const name = cleanName(request.name) || GENERIC_DEVICE
    let accepted: boolean
    try {
      accepted = await api.submitPin({ pairingId: request.pairingId, pin: request.pin, name })
    } catch (cause) {
      throw friendly(cause)
    }
    if (!accepted) {
      throw new Error('O PIN não confere. Confira o número que aparece no outro dispositivo.')
    }
    this.lastApprovedName = name
  }

  async deny(pairingId: string): Promise<void> {
    try {
      await this.requireApi().cancelPairing(pairingId)
    } catch (cause) {
      throw friendly(cause)
    }
  }

  async stopSending(): Promise<void> {
    try {
      await this.requireApi().closeApp()
    } catch (cause) {
      throw friendly(cause)
    }
  }

  /** O Sunshine só lê o limite ao iniciar uma sessão; vale na próxima conexão. */
  async applyBitrate(mbps: number): Promise<void> {
    if (this.api === null) return
    try {
      await this.api.saveConfig({ max_bitrate: String(Math.round(mbps * 1000)) })
    } catch (cause) {
      throw friendly(cause)
    }
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
