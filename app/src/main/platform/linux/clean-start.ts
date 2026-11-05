/**
 * O reinício do Electron depois de uma atualização abre o app com `no_new_privs` ligado. Nesse estado o Linux não deixa
 * programas com setuid ganharem permissão: o `pkexec` falha na hora, sem janela de senha, e isso quebra o firewall e a
 * próxima atualização. A trava passa para os filhos e não dá para desligar, então o app se reabre pelo systemd do
 * usuário, que abre um processo novo sem ela.
 */

/** Marca a segunda abertura: se a trava continuar (quem abriu quis assim), segue com ela, sem repetir para sempre. */
export const CLEAN_START_ENV = 'HORIZONTE_CLEAN_START'

/** O campo `NoNewPrivs` de /proc/self/status. */
export const hasNoNewPrivs = (status: string): boolean => /^NoNewPrivs:\s*1\s*$/m.test(status)

/** O comando que reabre o app limpo, um segundo depois (o tempo de este sair e soltar a trava de uma cópia só). */
export function cleanStartCommand(
  executable: string,
  args: string[]
): { command: string; args: string[] } {
  return {
    command: 'systemd-run',
    args: [
      '--user',
      '--collect',
      '--no-block',
      `--setenv=${CLEAN_START_ENV}=1`,
      '--on-active=1',
      '--timer-property=AccuracySec=100ms',
      executable,
      ...args
    ]
  }
}
