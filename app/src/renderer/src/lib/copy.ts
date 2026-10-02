import type { AppState, PrepStep } from '../../../shared/types'

export interface ScreenCopy {
  title: string
  subtitle?: string
  pill?: { tone: 'ok' | 'wait'; text: string }
}

/** Nome vindo da rede: sem controles nem caracteres de direção invertida, no máximo 40 caracteres. */
export function safeName(raw: string): string {
  const cleaned = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 40)
  return cleaned || 'Outro computador'
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
      return { title: 'Recebendo a tela.', pill: { tone: 'ok', text: safeName(state.host) } }
    case 'error':
      return { title: state.error.message, subtitle: state.error.detail }
  }
}

export const PREP_STEPS: readonly PrepStep[] = ['engine', 'display', 'encoder']

const LABELS: Record<PrepStep, { done: string; active: string }> = {
  engine: { done: 'Motor instalado', active: 'Instalando o motor' },
  display: { done: 'Monitor virtual criado', active: 'Criando o monitor virtual' },
  encoder: { done: 'Placa de vídeo testada', active: 'Testando a placa de vídeo' }
}

export interface StepRow {
  label: string
  status: 'done' | 'active' | 'pending'
}

export function stepRows(current: PrepStep): StepRow[] {
  const at = PREP_STEPS.indexOf(current)
  const rows = PREP_STEPS.map<StepRow>((step, index) => {
    if (index < at) return { label: LABELS[step].done, status: 'done' }
    if (index === at) return { label: LABELS[step].active, status: 'active' }
    return { label: LABELS[step].active, status: 'pending' }
  })
  return [...rows, { label: 'Pronto', status: 'pending' }]
}

export function progress(current: PrepStep): number {
  return Math.round((PREP_STEPS.indexOf(current) / PREP_STEPS.length) * 100)
}
