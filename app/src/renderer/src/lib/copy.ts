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
      return { title: 'Este computador vai…' }
    case 'preparing':
      return { title: 'Preparando.' }
    case 'ready':
      return {
        title: 'Pronto.',
        subtitle: 'Abra o Horizonte no outro computador e escolha este.',
        pill: { tone: 'wait', text: 'Aguardando conexão' }
      }
    case 'approve':
      return {
        title: `Permitir o ${safeName(state.device)}?`,
        subtitle: 'Ele quer usar este computador como segunda tela.'
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

/** Depois de um tempo na mesma frase, ela ganha uma variação do mesmo assunto para mostrar que não travou. */
const PATIENCE = ['ainda trabalhando', 'continua em andamento', 'só está demorando um pouco']
const PATIENCE_AFTER_SECONDS = 8
const PATIENCE_EVERY_SECONDS = 6

export function patientNote(note: string, secondsOnIt: number): string {
  if (secondsOnIt < PATIENCE_AFTER_SECONDS) return note
  const turn = Math.floor((secondsOnIt - PATIENCE_AFTER_SECONDS) / PATIENCE_EVERY_SECONDS)
  return `${note} · ${PATIENCE[turn % PATIENCE.length]}`
}
