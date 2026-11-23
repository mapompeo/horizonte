import { expect, test, vi } from 'vitest'
import { createUninstaller, UninstallCancelled, type UninstallPlan } from './uninstall'

function setup(): {
  plan: UninstallPlan & { run: ReturnType<typeof vi.fn<() => Promise<void>>> }
  deps: Parameters<typeof createUninstaller>[0] & {
    busy: ReturnType<typeof vi.fn<() => boolean>>
    stop: ReturnType<typeof vi.fn<() => void>>
    confirm: ReturnType<typeof vi.fn<(detail: string) => Promise<boolean>>>
    quit: ReturnType<typeof vi.fn<() => void>>
  }
} {
  const plan = { detail: 'O app sai.', run: vi.fn(async () => {}) }
  const deps = {
    packaged: true,
    plan: () => plan as UninstallPlan | null,
    busy: vi.fn(() => false),
    stop: vi.fn(),
    confirm: vi.fn(async () => true),
    quit: vi.fn()
  }
  return { plan, deps }
}

test('confirma com o texto do sistema, remove e fecha o app', async () => {
  const { plan, deps } = setup()
  expect(await createUninstaller(deps)()).toBe('started')
  expect(deps.confirm).toHaveBeenCalledWith('O app sai.')
  expect(plan.run).toHaveBeenCalledOnce()
  expect(deps.quit).toHaveBeenCalledOnce()
})
test('cancelar na confirmação ou na senha do sistema não remove nem fecha', async () => {
  const { plan, deps } = setup()
  deps.confirm.mockResolvedValueOnce(false)
  expect(await createUninstaller(deps)()).toBe('cancelled')
  expect(plan.run).not.toHaveBeenCalled()
  plan.run.mockRejectedValueOnce(new UninstallCancelled())
  expect(await createUninstaller(deps)()).toBe('cancelled')
  expect(deps.quit).not.toHaveBeenCalled()
})
test('com uma conexão aberta, encerra ela sozinho antes de remover', async () => {
  const { plan, deps } = setup()
  deps.busy.mockReturnValue(true)
  expect(await createUninstaller(deps)()).toBe('started')
  expect(deps.stop).toHaveBeenCalledOnce()
  expect(deps.stop.mock.invocationCallOrder[0]).toBeLessThan(plan.run.mock.invocationCallOrder[0])
})
test('sem jeito de remover (ou em desenvolvimento) não faz nada', async () => {
  const { deps } = setup()
  expect(await createUninstaller({ ...deps, packaged: false })()).toBe('unavailable')
  expect(await createUninstaller({ ...deps, plan: () => null })()).toBe('unavailable')
  expect(deps.confirm).not.toHaveBeenCalled()
})
test('falha ao remover deixa o app aberto e dá para tentar de novo', async () => {
  const { plan, deps } = setup()
  const uninstall = createUninstaller(deps)
  plan.run.mockRejectedValueOnce(new Error('sem permissão'))
  expect(await uninstall()).toBe('failed')
  expect(deps.quit).not.toHaveBeenCalled()
  expect(await uninstall()).toBe('started')
})
test('dois cliques compartilham a mesma confirmação', async () => {
  const { plan, deps } = setup()
  const uninstall = createUninstaller(deps)
  await Promise.all([uninstall(), uninstall()])
  expect(deps.confirm).toHaveBeenCalledOnce()
  expect(plan.run).toHaveBeenCalledOnce()
})
