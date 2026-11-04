import type { VideoHint } from './video-driver'

/**
 * Economia de energia do Wi-Fi ligada: a placa cochila entre os pacotes e perde ou atrasa os que chegam em rajada,
 * como os quadros de vídeo. Medido num notebook Intel (5 GHz, sinal -47 dBm): com ela ligada, 374 ms de atraso
 * (mediana) e pacotes perdidos; desligada, 131 ms e nenhuma perda.
 */
export interface WifiFacts {
  /** Interfaces sem fio conectadas, com o estado da economia de energia (`iw dev <x> get power_save`). */
  interfaces: { name: string; powerSave: boolean | null }[]
}

/** O comando deixa desligada de vez pelo NetworkManager (vale para todas as redes) e reconecta. */
export const WIFI_POWER_COMMAND =
  "printf '[connection]\\nwifi.powersave = 2\\n' | sudo tee /etc/NetworkManager/conf.d/horizonte-wifi.conf && sudo systemctl restart NetworkManager"

export function wifiPowerHint(facts: WifiFacts): VideoHint | null {
  if (!facts.interfaces.some((i) => i.powerSave === true)) return null
  return {
    message:
      'A economia de energia do Wi-Fi está ligada neste computador e atrasa a imagem em até meio segundo. Desligue com o comando abaixo (a rede cai por um instante).',
    command: WIFI_POWER_COMMAND
  }
}

/** Lê a saída do `iw dev <x> get power_save`. */
export function parsePowerSave(output: string): boolean | null {
  const match = /Power save:\s*(on|off)/i.exec(output)
  return match ? match[1].toLowerCase() === 'on' : null
}
