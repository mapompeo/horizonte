import { cleanName } from '../../../shared/names'
import type { AppState, PrepStep } from '../../../shared/types'

export interface ScreenCopy {
  title: string
  subtitle?: string
  pill?: { tone: 'ok' | 'wait'; text: string }
}

/** Nome vindo da rede: sem controles nem caracteres de direção invertida, no máximo 40 caracteres. */
export function safeName(raw: string): string {
  return cleanName(raw) || 'Outro computador'
}

export function copyFor(state: AppState): ScreenCopy {
  switch (state.screen) {
    case 'install':
      return { title: 'Estenda sua tela,\nsem fio.' }
    case 'choose':
      return { title: 'Este dispositivo vai…' }
    case 'preparing':
      return { title: 'Preparando.' }
    case 'ready':
      return { title: 'Pronto.' }
    case 'approve':
      return {
        title: `Permitir o ${safeName(state.device)}?`,
        subtitle: 'Quer usar esta tela como extensão.'
      }
    case 'connected': {
      const names = state.devices.map((d) => safeName(d.device))
      const many = names.length > 1
      const list = many ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0]
      return {
        title: many ? 'Telas estendidas.' : 'Tela estendida.',
        pill: { tone: 'ok', text: `${list} ${many ? 'conectados' : 'conectado'}` }
      }
    }
    case 'discover':
      return { title: 'Na sua rede' }
    case 'receiving':
      return { title: 'Recebendo a tela.', pill: { tone: 'ok', text: safeName(state.name) } }
    case 'mouse':
      return {
        title: 'Um mouse, vários computadores.'
      }
    case 'mouse-request':
      return {
        title: `Usar o mouse do ${safeName(state.device)}?`,
        subtitle: 'Ele vai controlar este computador.'
      }
    case 'mouse-active':
      return state.role === 'share'
        ? {
            title: 'Mouse compartilhado.',
            subtitle: 'Passe o mouse pela borda da tela.',
            pill: { tone: 'ok', text: safeName(state.device) }
          }
        : {
            title: 'Controlado pelo outro mouse.',
            pill: { tone: 'ok', text: safeName(state.device) }
          }
    case 'error':
      return { title: state.error.message, subtitle: state.error.detail }
  }
}

/** Diz ao outro aparelho qual nome procurar na lista. */
export const readySubtitle = (deviceName: string): string =>
  `No outro aparelho, escolha ${safeName(deviceName)}.`

export const PREP_STEPS: readonly PrepStep[] = ['engine', 'display', 'encoder']

const STEP_LABELS: Record<PrepStep, string> = {
  engine: 'Preparando o motor',
  display: 'Procurando o monitor virtual',
  encoder: 'Testando a placa de vídeo'
}

export const stepLabel = (step: PrepStep): string => STEP_LABELS[step]

/** Onde cada etapa começa no caminho todo (0 a 1); o motor usa a mesma divisão ao avisar o progresso. */
const STEP_START: Record<PrepStep, number> = { engine: 0, display: 0.55, encoder: 0.65 }

export const stepStart = (step: PrepStep): number => STEP_START[step]

/** Onde a etapa termina: a barra de uma etapa nunca passa daqui antes de a próxima começar. */
export const stepEnd = (step: PrepStep): number => {
  const next = PREP_STEPS[PREP_STEPS.indexOf(step) + 1]
  return next ? STEP_START[next] : 1
}

/** Depois de um tempo parado na mesma frase, ela dá lugar a um aviso de que não travou, com pontinhos que se movem. */
const PATIENCE_TEXT = 'Ainda trabalhando nisso'
const PATIENCE_AFTER_SECONDS = 8

export function patientNote(note: string, secondsOnIt: number): string {
  if (secondsOnIt < PATIENCE_AFTER_SECONDS) return note
  const dots = '.'.repeat(Math.floor(secondsOnIt) % 4)
  return `${PATIENCE_TEXT}${dots}`
}
