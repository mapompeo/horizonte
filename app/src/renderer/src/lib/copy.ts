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
      return { title: 'Estenda sua tela,\nsem fio.', subtitle: 'Sem configurar nada.' }
    case 'choose':
      return { title: 'Este dispositivo vai…' }
    case 'preparing':
      return { title: 'Preparando.' }
    case 'ready':
      return {
        title: 'Pronto.',
        pill: { tone: 'wait', text: 'Aguardando conexão' }
      }
    case 'approve':
      return {
        title: `Permitir o ${safeName(state.device)}?`,
        subtitle: 'Ele quer receber a tela deste dispositivo.'
      }
    case 'connected':
      return {
        title: 'Tela estendida.',
        pill: { tone: 'ok', text: `${safeName(state.device)} conectado` }
      }
    case 'discover':
      return { title: 'Na sua rede' }
    case 'receiving':
      return { title: 'Recebendo a tela.', pill: { tone: 'ok', text: safeName(state.name) } }
    case 'error':
      return { title: state.error.message, subtitle: state.error.detail }
  }
}

/** Diz ao outro aparelho qual nome procurar na lista. */
export const readySubtitle = (deviceName: string): string =>
  `Abra o Horizonte no outro dispositivo e selecione ${safeName(deviceName)}.`

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
