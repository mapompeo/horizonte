/** Endereço ou nome de rede: sem espaços nem controles, para nunca virar argumento de linha de comando. */
const HOST_ADDRESS = /^[A-Za-z0-9._:%[\]-]{1,255}$/

export function isHostAddress(value: unknown): value is string {
  return typeof value === 'string' && HOST_ADDRESS.test(value) && !value.startsWith('-')
}
