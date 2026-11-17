import { expect, test, vi } from 'vitest'
import { choosePlan } from './uninstall-plans'

const env = (
  over: Partial<Parameters<typeof choosePlan>[0]>
): Parameters<typeof choosePlan>[0] => ({
  platform: 'linux',
  executable: '/opt/Horizonte/horizonte',
  dataDir: '/home/a/.config/Horizonte',
  configDir: '/home/a/.config',
  exists: () => false,
  ...over
})
const acts = (): Parameters<typeof choosePlan>[1] & Record<string, ReturnType<typeof vi.fn>> => ({
  launch: vi.fn(async () => {}),
  elevate: vi.fn(async () => {}),
  trash: vi.fn(async () => {}),
  removeAfterQuit: vi.fn()
})
const AUTOSTART = '/home/a/.config/autostart/horizonte.desktop'
const LEGACY = '/home/a/.config/autostart/com.horizonte.app.desktop'

test('Windows: abre o desinstalador ao lado do executável', async () => {
  const act = acts()
  const plan = choosePlan(
    env({
      platform: 'win32',
      executable: 'C:\\Apps\\Horizonte\\Horizonte.exe',
      exists: () => true
    }),
    act
  )
  await plan?.run()
  expect(act.launch).toHaveBeenCalledWith('C:\\Apps\\Horizonte\\Uninstall Horizonte.exe')
  expect(choosePlan(env({ platform: 'win32', executable: 'C:\\x\\Horizonte.exe' }), act)).toBeNull()
})
test('Linux .deb: pede a senha ao sistema e remove o pacote, os ajustes e o início automático', async () => {
  const act = acts()
  const plan = choosePlan(env({ exists: (p) => p === '/var/lib/dpkg/info/horizonte.list' }), act)
  await plan?.run()
  expect(act.elevate).toHaveBeenCalledWith('pkexec', ['apt-get', 'remove', '-y', 'horizonte'])
  expect(act.removeAfterQuit).toHaveBeenCalledWith(['/home/a/.config/Horizonte', AUTOSTART, LEGACY])
})
test('Linux AppImage: apaga o próprio arquivo, os ajustes e o início automático', async () => {
  const act = acts()
  const plan = choosePlan(env({ appImage: '/home/a/Apps/Horizonte.AppImage' }), act)
  await plan?.run()
  expect(act.elevate).not.toHaveBeenCalled()
  expect(act.removeAfterQuit).toHaveBeenCalledWith([
    '/home/a/Apps/Horizonte.AppImage',
    '/home/a/.config/Horizonte',
    AUTOSTART,
    LEGACY
  ])
})
test('Mac: manda o Horizonte.app para o Lixo e apaga os ajustes', async () => {
  const act = acts()
  const plan = choosePlan(
    env({
      platform: 'darwin',
      executable: '/Applications/Horizonte.app/Contents/MacOS/Horizonte',
      dataDir: '/Users/a/Library/Application Support/Horizonte'
    }),
    act
  )
  await plan?.run()
  expect(act.trash).toHaveBeenCalledWith('/Applications/Horizonte.app')
  expect(act.removeAfterQuit).toHaveBeenCalledWith([
    '/Users/a/Library/Application Support/Horizonte'
  ])
})
test('Linux sem pacote nem AppImage: não sabe remover', () => {
  expect(choosePlan(env({}), acts())).toBeNull()
})
