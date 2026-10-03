/** `true` só se `installed` for uma versão válida e mais antiga que `pinned` (ex.: 2026.914.233613). Desconhecida não vale como antiga. */
export function isOlder(installed: string, pinned: string): boolean {
  const parse = (v: string): number[] | null =>
    /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null
  const a = parse(installed)
  const b = parse(pinned)
  if (!a || !b) return false
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}
