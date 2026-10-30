import { describe, expect, it } from 'vitest'
import { parseMotorArgs } from './args'

describe('parseMotorArgs', () => {
  it('sem as opções do motor, abre o app normal', () => {
    expect(parseMotorArgs(['electron', '.', '--remote-debugging-port=9300'])).toBeNull()
  })

  it('envia', () => {
    expect(parseMotorArgs(['--motor-send', '--motor-clock'])).toEqual({
      role: 'send',
      synthetic: false,
      clock: true
    })
    expect(parseMotorArgs(['--motor-send', '--motor-synthetic', '--motor-port=47915'])).toEqual({
      role: 'send',
      port: 47915,
      synthetic: true,
      clock: false
    })
  })

  it('mostra, com os padrões', () => {
    expect(parseMotorArgs(['--motor-receive=192.168.1.3'])).toEqual({
      role: 'receive',
      host: '192.168.1.3',
      fps: 60,
      bitrate: 30,
      testFrames: null
    })
  })

  it('mostra, com porta no endereço e ajustes', () => {
    expect(
      parseMotorArgs([
        '--motor-receive=127.0.0.1:47915',
        '--motor-fps=30',
        '--motor-bitrate=50',
        '--motor-size=2560x1440',
        '--motor-test-frames=120'
      ])
    ).toEqual({
      role: 'receive',
      host: '127.0.0.1',
      port: 47915,
      fps: 30,
      bitrate: 50,
      size: { width: 2560, height: 1440 },
      testFrames: 120
    })
  })

  it('aceita IPv6 entre colchetes e nome de máquina', () => {
    expect(parseMotorArgs(['--motor-receive=[fe80::1]:47910'])).toMatchObject({
      host: 'fe80::1',
      port: 47910
    })
    expect(parseMotorArgs(['--motor-receive=desktop.local'])).toMatchObject({
      host: 'desktop.local'
    })
  })

  it.each([
    [['--motor-send', '--motor-receive=1.2.3.4'], /não os dois/],
    [['--motor-receive'], /precisa do endereço/],
    [['--motor-receive=1.2.3.4;rm'], /Endereço inválido/],
    [['--motor-receive=1.2.3.4', '--motor-fps=0'], /motor-fps/],
    [['--motor-receive=1.2.3.4', '--motor-size=grande'], /LARGURAxALTURA/],
    [['--motor-send', '--motor-port=99999'], /motor-port/]
  ])('recusa %j', (argv, error) => {
    expect(() => parseMotorArgs(argv)).toThrow(error)
  })
})
