import { psQuote } from './elevation'

/**
 * Firewall do Windows. Na primeira vez que o app abre as portas, o próprio Windows pergunta se ele pode usar a rede:
 * o app não tem como evitar a pergunta (o instalador roda sem administrador). O que dá para fazer é avisar antes e,
 * se a pessoa tocou em Cancelar (o Windows grava um bloqueio), oferecer liberar de novo, com um pedido de
 * administrador.
 */
export type FirewallState = 'allowed' | 'blocked' | 'unknown'

/** Lê as regras de entrada deste programa, sem administrador. Imprime "bloqueado", "liberado" ou "nada". */
export function firewallStateScript(executable: string): string {
  return [
    `$rules = @(Get-NetFirewallApplicationFilter -Program ${psQuote(executable)} -ErrorAction SilentlyContinue |`,
    '  Get-NetFirewallRule -ErrorAction SilentlyContinue |',
    "  Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' })",
    // Firewall desligado na rede de casa: não há o que perguntar.
    "if ((Get-NetFirewallProfile -Name Private -ErrorAction SilentlyContinue).Enabled -eq 'False') { 'liberado' }",
    "elseif ($rules | Where-Object { $_.Action -eq 'Block' }) { 'bloqueado' }",
    "elseif ($rules | Where-Object { $_.Action -eq 'Allow' }) { 'liberado' }",
    "else { 'nada' }"
  ].join('\n')
}

/** Um bloqueio vale mais que uma liberação: é o que o Windows faz quando há os dois. */
export function parseFirewallState(out: string): FirewallState {
  if (out.includes('bloqueado')) return 'blocked'
  if (out.includes('liberado')) return 'allowed'
  return 'unknown'
}

/**
 * Com administrador: tira as regras deste programa (o bloqueio do Cancelar) e libera a entrada só em redes privadas,
 * a de casa. Em Wi-Fi público continua fechado.
 */
export function firewallAllowScript(executable: string): string {
  const program = psQuote(executable)
  return [
    `Get-NetFirewallApplicationFilter -Program ${program} -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    `New-NetFirewallRule -DisplayName 'Horizonte' -Direction Inbound -Action Allow -Program ${program} -Protocol TCP -Profile Private | Out-Null`,
    `New-NetFirewallRule -DisplayName 'Horizonte' -Direction Inbound -Action Allow -Program ${program} -Protocol UDP -Profile Private | Out-Null`
  ].join('\n')
}
