import { describe, expect, it } from 'vitest'
import {
  CLEAN_START_ENV,
  cleanStartCommand,
  hasNoNewPrivs,
  takeCleanStartMark
} from './clean-start'

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

it('a marca vale só para este processo: lida e apagada, não passa para o app reaberto depois de atualizar', () => {
  const env: NodeJS.ProcessEnv = { [CLEAN_START_ENV]: '1', PATH: '/usr/bin' }
  expect(takeCleanStartMark(env)).toBe(true)
  expect(env[CLEAN_START_ENV]).toBeUndefined()
  expect(env.PATH).toBe('/usr/bin')
  // O processo seguinte (reaberto pelo Electron, com a trava) não vê marca nenhuma e se corrige.
  expect(takeCleanStartMark(env)).toBe(false)
})
