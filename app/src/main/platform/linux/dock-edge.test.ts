import { describe, expect, it } from 'vitest'
import { dockEdgeHint } from './dock-edge'

const dock = { position: "'BOTTOM'\n", autohide: 'true\n', pressure: 'true\n' }

describe('dock na mesma borda de uma tela', () => {
  it('avisa só com uma tela nessa borda', () => {
    expect(dockEdgeHint(dock, ['below'])?.command).toContain('require-pressure-to-show false')
    expect(dockEdgeHint(dock, ['right', 'left'])).toBeNull()
    expect(dockEdgeHint(dock, [])).toBeNull()
  })

  it('sem ocultar ou sem pressão, não há barreira', () => {
    expect(dockEdgeHint({ ...dock, autohide: 'false\n' }, ['below'])).toBeNull()
    expect(dockEdgeHint({ ...dock, pressure: 'false\n' }, ['below'])).toBeNull()
  })
})
