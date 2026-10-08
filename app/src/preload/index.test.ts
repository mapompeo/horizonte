import { expect, test, vi } from 'vitest'
import { CHANNELS, type HorizonteApi } from '../shared/api'
const { invoke, expose } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue('opened'),
  expose: vi.fn()
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: expose },
  ipcRenderer: { invoke }
}))
test('preload expõe consulta e relatório pelos canais tipados, sem URL recebida', async () => {
  await import('./index')
  const api = expose.mock.calls[0][1] as HorizonteApi
  await api.getDiagnosticDraft(true)
  expect(invoke).toHaveBeenLastCalledWith(CHANNELS.diagnosticDraft, true)
  expect(await api.reportDiagnostic('revisado')).toBe('opened')
  expect(invoke).toHaveBeenLastCalledWith(CHANNELS.reportDiagnostic, 'revisado')
})
