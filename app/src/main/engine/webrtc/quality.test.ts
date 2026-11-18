import { expect, it } from 'vitest'
import type { MotorStats } from '../../../shared/motor'
import { linkOf } from './quality'

const stats = (rttMs: number | null, qualityLimitation: string | null = null): MotorStats =>
  ({ rttMs, qualityLimitation }) as MotorStats

it('conexão: boa até 25 ms, regular até 60 ms ou sem banda, fraca acima; sem medida, nada', () => {
  expect(linkOf(stats(8))).toBe('good')
  expect(linkOf(stats(25))).toBe('good')
  expect(linkOf(stats(26))).toBe('fair')
  expect(linkOf(stats(8, 'bandwidth'))).toBe('fair')
  expect(linkOf(stats(60))).toBe('fair')
  expect(linkOf(stats(61))).toBe('poor')
  expect(linkOf(stats(null))).toBeNull()
})
