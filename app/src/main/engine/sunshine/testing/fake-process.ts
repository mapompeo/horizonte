import { SunshineApiError, type Pairing, type SunshineApiPort } from '../api'

export interface FakeDisplay {
  deviceId: string
  friendlyName: string
  primary?: boolean
  originX?: number
}

const header = (n: number): string =>
  `[2026-10-02 18:00:0${n}.000]: Info: Sunshine version: 2026.914.233613 commit: abc\n`

/** Sunshine simulado: a API e o log reagem a reinícios, que duram `restartTicks` chamadas de tick(). */
export class FakeSunshineProcess implements SunshineApiPort {
  config: Record<string, unknown> = {}
  pairings: Pairing[] = []
  displays: FakeDisplay[] = [{ deviceId: '{aaa}', friendlyName: '24G2W1G4', primary: true }]
  /** Valores de amd_usage com os quais o encoder de GPU abre. */
  hardwareWorksWith = new Set<string>(['lowlatency_high_quality', 'transcoding'])
  acceptPin = '4821'
  reachable = true
  restartTicks = 2
  restarts = 0
  calls: string[] = []
  unauthorized = false
  log = ''

  private remaining = 0
  private nextLog: string | null = null

  constructor() {
    this.log = this.buildLog(0)
  }

  /** Chamado pelo `sleep` injetado nos testes: o tempo "passa" um passo. */
  tick(): void {
    if (this.remaining > 0) {
      this.remaining--
      if (this.remaining === 0 && this.nextLog !== null) {
        this.log = this.nextLog
        this.nextLog = null
        this.reachable = true
      }
    }
  }

  async readLog(): Promise<string> {
    return this.log
  }

  /** Refaz o log da partida atual a partir do estado de agora (monitores, configuração). */
  rebuildLog(): void {
    this.log = this.buildLog(0)
  }

  addLogLine(line: string): void {
    this.log += `[2026-10-02 18:30:00.000]: Info: ${line}\n`
  }

  private buildLog(n: number): string {
    const devices = this.displays.map((display) => ({
      device_id: display.deviceId,
      display_name: '\\\\.\\DISPLAY1',
      friendly_name: display.friendlyName,
      info: {
        primary: display.primary === true,
        origin_point: { x: display.originX ?? 0, y: 0 },
        resolution: { width: 1920, height: 1080 }
      }
    }))
    const usage = String(this.config.amd_usage ?? '')
    const software = String(this.config.encoder ?? '') === 'software'
    const hardware = !software && this.hardwareWorksWith.has(usage)
    const found = hardware ? 'h264_amf [amdvce]' : 'libx264 [software]'
    return (
      header(n) +
      `[2026-10-02 18:00:0${n}.100]: Info: Currently available display devices:\n` +
      JSON.stringify(devices, null, 2) +
      '\n' +
      `[2026-10-02 18:00:0${n}.200]: Info: // Testing for available encoders, this may generate errors. //\n` +
      `[2026-10-02 18:00:0${n}.300]: Info: Found H.264 encoder: ${found}\n` +
      `[2026-10-02 18:00:0${n}.400]: Info: Configuration UI available at [https://localhost:47990]\n`
    )
  }

  private guard(): void {
    if (!this.reachable) {
      throw new SunshineApiError('unreachable', 'Não consegui falar com o Sunshine.')
    }
    if (this.unauthorized) {
      throw new SunshineApiError('unauthorized', 'O Sunshine recusou o usuário ou a senha.', 401)
    }
  }

  async listPairings(): Promise<Pairing[]> {
    this.guard()
    return [...this.pairings]
  }

  async submitPin(request: { pairingId: string; pin: string; name: string }): Promise<boolean> {
    this.guard()
    this.calls.push(`submitPin:${request.pairingId}:${request.pin}:${request.name}`)
    const ok =
      this.pairings.some((pairing) => pairing.id === request.pairingId) &&
      request.pin === this.acceptPin
    if (ok) this.pairings = this.pairings.filter((pairing) => pairing.id !== request.pairingId)
    return ok
  }

  async cancelPairing(pairingId: string): Promise<void> {
    this.guard()
    this.calls.push(`cancelPairing:${pairingId}`)
    this.pairings = this.pairings.filter((pairing) => pairing.id !== pairingId)
  }

  async getConfig(): Promise<Record<string, unknown>> {
    this.guard()
    return { ...this.config }
  }

  async saveConfig(patch: Record<string, string>): Promise<void> {
    this.guard()
    this.calls.push(`saveConfig:${JSON.stringify(patch)}`)
    this.config = { ...this.config, ...patch }
  }

  async restart(): Promise<void> {
    this.guard()
    this.calls.push('restart')
    this.restarts++
    this.reachable = false
    this.remaining = this.restartTicks
    this.nextLog = this.buildLog(this.restarts)
  }

  async closeApp(): Promise<void> {
    this.guard()
    this.calls.push('closeApp')
  }
}
