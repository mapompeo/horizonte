export const PIN_PATTERN = /^\d{4}$/

/** O PIN do Sunshine tem sempre 4 dígitos. */
export function isValidPin(value: unknown): value is string {
  return typeof value === 'string' && PIN_PATTERN.test(value)
}
