import type { AppEvent, Mode, SettingsPatch } from '../../../shared/types'
import { route } from './store'

export const send = (event: AppEvent): Promise<void> => window.horizonte.dispatch(event)
export const chooseMode = (mode: Mode): Promise<void> => send({ type: 'CHOOSE', mode })
export const patchSettings = (patch: SettingsPatch): Promise<unknown> => window.horizonte.updateSettings(patch)
export const openSettings = (): void => route.set('settings')
export const closeSettings = (): void => route.set('main')
