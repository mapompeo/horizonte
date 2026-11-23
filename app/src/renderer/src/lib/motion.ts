/** Quem pede menos movimento fica sem transições: a duração vira 0. */
export const ms = (duration: number): number =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : duration
