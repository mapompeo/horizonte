/**
 * Limpa um nome que veio de fora (rede ou arquivo): sem controles, quebras de linha nem
 * caracteres de formatação (direção invertida, largura zero), cortado por caractere.
 */
export function cleanName(raw: string, maxLength = 40): string {
  const cleaned = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  return Array.from(cleaned).slice(0, maxLength).join('')
}
