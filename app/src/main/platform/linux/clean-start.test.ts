import { describe, expect, it } from 'vitest'
import { CLEAN_START_ENV, cleanStartCommand, hasNoNewPrivs } from './clean-start'

describe('abertura sem a trava do reinício', () => {
  it('lê o campo do /proc', () => {
    expect(hasNoNewPrivs('Name:\thorizonte\nNoNewPrivs:\t1\nSeccomp:\t0\n')).toBe(true)
    expect(hasNoNewPrivs('Name:\thorizonte\nNoNewPrivs:\t0\nSeccomp:\t0\n')).toBe(false)
    expect(hasNoNewPrivs('')).toBe(false)
  })

  it('reabre pelo systemd do usuário, com os mesmos argumentos e a marca de segunda abertura', () => {
    const { command, args } = cleanStartCommand('/opt/Horizonte/horizonte', ['--user-data-dir=/x'])
    expect(command).toBe('systemd-run')
    expect(args).toContain('--user')
    expect(args).toContain(`--setenv=${CLEAN_START_ENV}=1`)
    expect(args.slice(-2)).toEqual(['/opt/Horizonte/horizonte', '--user-data-dir=/x'])
  })
})
