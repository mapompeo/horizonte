/** Mediana e percentil 95 de uma série, para o resumo da sessão. */
export function percentiles(values: number[]): { median: number; p95: number } | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return { median: at(0.5), p95: at(0.95) }
}
