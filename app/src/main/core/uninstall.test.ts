import { expect, test, vi } from 'vitest'
import { createUninstaller } from './uninstall'

function setup(): {
  deps: {
    platform: string
    packaged: boolean
    executable: string
    exists: ReturnType<typeof vi.fn<() => boolean>>
    busy: ReturnType<typeof vi.fn<() => boolean>>
    confirm: ReturnType<typeof vi.fn<() => Promise<boolean>>>
    launch: ReturnType<typeof vi.fn<() => Promise<void>>>
    quit: ReturnType<typeof vi.fn<() => void>>
  }
  uninstall: ReturnType<typeof createUninstaller>
} {
  const deps = {
    platform: 'win32',
    packaged: true,
    executable: 'C:\\Apps\\Horizonte\\Horizonte.exe',
    exists: vi.fn(() => true),
    busy: vi.fn(() => false),
    confirm: vi.fn(async () => true),
    launch: vi.fn(async () => {}),
    quit: vi.fn()
  }
  return { deps, uninstall: createUninstaller(deps) }
}
test('usa somente o desinstalador ao lado do executável e encerra após iniciar', async () => {
  const { deps, uninstall } = setup()
  expect(await uninstall()).toBe('started')
  expect(deps.launch).toHaveBeenCalledWith('C:\\Apps\\Horizonte\\Uninstall Horizonte.exe')
  expect(deps.quit).toHaveBeenCalledOnce()
})
test('cancelamento não abre nem encerra o aplicativo', async () => {
  const { deps, uninstall } = setup()
  deps.confirm.mockResolvedValue(false)
  expect(await uninstall()).toBe('cancelled')
  expect(deps.launch).not.toHaveBeenCalled()
  expect(deps.quit).not.toHaveBeenCalled()
})
test('conexão ou atualização ativa bloqueia a remoção antes da confirmação', async () => {
  const { deps, uninstall } = setup()
  deps.busy.mockReturnValue(true)
  expect(await uninstall()).toBe('busy')
  expect(deps.confirm).not.toHaveBeenCalled()
})
test.each(['darwin', 'linux'])('informa remoção pelo sistema em %s', async (platform) => {
  const { deps } = setup()
  deps.platform = platform
  expect(await createUninstaller(deps)()).toBe('manual')
  expect(deps.launch).not.toHaveBeenCalled()
})
test('não tenta remover desenvolvimento ou instalação sem desinstalador', async () => {
  const { deps } = setup()
  deps.packaged = false
  expect(await createUninstaller(deps)()).toBe('unavailable')
  deps.packaged = true
  deps.exists.mockReturnValue(false)
  expect(await createUninstaller(deps)()).toBe('unavailable')
})
test('falha ao iniciar preserva o app aberto', async () => {
  const { deps, uninstall } = setup()
  deps.launch.mockRejectedValue(new Error('access denied'))
  expect(await uninstall()).toBe('failed')
  expect(deps.quit).not.toHaveBeenCalled()
})
test('dois cliques compartilham a mesma confirmação', async () => {
  const { deps, uninstall } = setup()
  await Promise.all([uninstall(), uninstall()])
  expect(deps.confirm).toHaveBeenCalledOnce()
  expect(deps.launch).toHaveBeenCalledOnce()
})
