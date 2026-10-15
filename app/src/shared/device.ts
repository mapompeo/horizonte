/** Que tipo de aparelho é: define o ícone em todo o app. */
export type DeviceKind = 'desktop' | 'laptop' | 'tablet' | 'phone' | 'tv'

export const DEVICE_KINDS: readonly DeviceKind[] = ['desktop', 'laptop', 'tablet', 'phone', 'tv']

export const isDeviceKind = (value: unknown): value is DeviceKind =>
  DEVICE_KINDS.includes(value as DeviceKind)

/**
 * Tipo de gabinete do SMBIOS (o mesmo número no Windows, `Win32_SystemEnclosure.ChassisTypes`, e no Linux,
 * `/sys/class/dmi/id/chassis_type`). Desconhecido: null, e quem chama decide pela bateria.
 */
export function kindFromChassis(code: number): DeviceKind | null {
  if ([8, 9, 10, 14, 31, 32].includes(code)) return 'laptop'
  if (code === 30) return 'tablet'
  if ([3, 4, 5, 6, 7, 13, 15, 16, 24, 35, 36].includes(code)) return 'desktop'
  return null
}

/**
 * Palpite pelo nome, para quem não diz o próprio tipo (o app Moonlight do celular ou da TV, o navegador). Os
 * aparelhos costumam se chamar pelo modelo: "iPhone de Ana", "Galaxy Tab S9", "SHIELD Android TV".
 */
export function guessKind(name: string): DeviceKind {
  const n = name.toLowerCase()
  if (/\b(tv|shield|chromecast|fire ?tv|roku|bravia|webos|tizen|televis)/.test(n)) return 'tv'
  if (/\b(ipad|tablet|galaxy tab|tab s\d|mediapad|surface go)/.test(n)) return 'tablet'
  if (/\b(iphone|android|pixel|galaxy|celular|phone|moto|redmi|xiaomi|poco)/.test(n)) return 'phone'
  if (/\b(notebook|laptop|macbook|thinkpad|xps|zenbook|vivobook|ideapad|chromebook)/.test(n))
    return 'laptop'
  return 'desktop'
}
