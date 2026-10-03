import { describe, expect, it } from 'vitest'
import { noClientEngine } from './no-client'

describe('noClientEngine', () => {
  it('não inventa aparelhos na rede', async () => {
    expect(await noClientEngine().listHosts()).toEqual([])
  })

  it('conectar diz com clareza que ainda não existe', async () => {
    await expect(noClientEngine().connect('192.168.1.3', {} as never)).rejects.toThrow(
      /ainda não está disponível/
    )
  })
})
