import { cleanName } from '../../../shared/names'
import type { AppState, PrepStep } from '../../../shared/types'
import { L } from './i18n'

export interface ScreenCopy {
  title: string
  subtitle?: string
  pill?: { tone: 'ok' | 'wait'; text: string }
}

/** Nome vindo da rede: sem controles nem caracteres de direção invertida, no máximo 40 caracteres. */
export function safeName(raw: string): string {
  return (
    cleanName(raw) || L({ pt: 'Outro computador', en: 'Other computer', es: 'Otra computadora' })
  )
}

export function copyFor(state: AppState): ScreenCopy {
  switch (state.screen) {
    case 'preparing':
      return { title: L({ pt: 'Preparando', en: 'Getting ready', es: 'Preparando' }) }
    case 'ready':
      return { title: L({ pt: 'Pronto', en: 'Ready', es: 'Listo' }) }
    case 'approve':
      return {
        title: L({
          pt: `Permitir o ${safeName(state.device)}?`,
          en: `Allow ${safeName(state.device)}?`,
          es: `¿Permitir ${safeName(state.device)}?`
        }),
        subtitle: L({
          pt: 'Quer estender a tela.',
          en: 'It wants to extend the screen.',
          es: 'Quiere extender la pantalla.'
        })
      }
    case 'connected': {
      const names = state.devices.map((d) => safeName(d.device))
      const many = names.length > 1
      const and = L({ pt: 'e', en: 'and', es: 'y' })
      const list = many ? `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}` : names[0]
      return {
        title: many
          ? L({ pt: 'Telas estendidas', en: 'Extended screens', es: 'Pantallas extendidas' })
          : L({ pt: 'Tela estendida', en: 'Extended screen', es: 'Pantalla extendida' }),
        pill: {
          tone: 'ok',
          text: `${list} ${many ? L({ pt: 'conectados', en: 'connected', es: 'conectados' }) : L({ pt: 'conectado', en: 'connected', es: 'conectado' })}`
        }
      }
    }
    case 'discover':
      return { title: L({ pt: 'Na sua rede', en: 'On your network', es: 'En tu red' }) }
    case 'receiving':
      return {
        title: L({
          pt: 'Recebendo a tela',
          en: 'Receiving the screen',
          es: 'Recibiendo la pantalla'
        }),
        pill: { tone: 'ok', text: safeName(state.name) }
      }
    case 'mouse':
      return {
        title: L({ pt: 'Compartilhar o mouse', en: 'Share the mouse', es: 'Compartir el mouse' })
      }
    case 'mouse-request':
      return {
        title: L({
          pt: `Usar o mouse do ${safeName(state.device)}?`,
          en: `Use the mouse of ${safeName(state.device)}?`,
          es: `¿Usar el mouse de ${safeName(state.device)}?`
        }),
        subtitle: L({
          pt: 'Ele vai controlar este aparelho.',
          en: 'It will control this device.',
          es: 'Va a controlar este dispositivo.'
        })
      }
    case 'mouse-active':
      return state.role === 'share'
        ? {
            title: L({ pt: 'Mouse compartilhado', en: 'Mouse shared', es: 'Mouse compartido' }),
            subtitle: L({
              pt: 'Passe o mouse pela borda da tela.',
              en: 'Move the mouse across the edge of the screen.',
              es: 'Pasa el mouse por el borde de la pantalla.'
            }),
            pill: { tone: 'ok', text: safeName(state.device) }
          }
        : {
            title: L({
              pt: 'Controlado pelo outro mouse',
              en: 'Controlled by the other mouse',
              es: 'Controlado por el otro mouse'
            }),
            pill: { tone: 'ok', text: safeName(state.device) }
          }
    case 'error':
      return { title: state.error.message, subtitle: state.error.detail }
  }
}

export const PREP_STEPS: readonly PrepStep[] = ['engine', 'display', 'encoder']

const STEP_LABELS = (): Record<PrepStep, string> => ({
  engine: L({ pt: 'Preparando', en: 'Getting ready', es: 'Preparando' }),
  display: L({ pt: 'Criando a tela', en: 'Creating the screen', es: 'Creando la pantalla' }),
  encoder: L({ pt: 'Verificando o vídeo', en: 'Checking the video', es: 'Verificando el video' })
})

export const stepLabel = (step: PrepStep): string => STEP_LABELS()[step]

/** Onde cada etapa começa no caminho todo (0 a 1); o motor usa a mesma divisão ao avisar o progresso. */
const STEP_START: Record<PrepStep, number> = { engine: 0, display: 0.55, encoder: 0.65 }

export const stepStart = (step: PrepStep): number => STEP_START[step]

/** Onde a etapa termina: a barra de uma etapa nunca passa daqui antes de a próxima começar. */
export const stepEnd = (step: PrepStep): number => {
  const next = PREP_STEPS[PREP_STEPS.indexOf(step) + 1]
  return next ? STEP_START[next] : 1
}

/** Depois de um tempo parado na mesma frase, ela dá lugar a um aviso de que não travou, com pontinhos que se movem. */

const PATIENCE_AFTER_SECONDS = 8

export function patientNote(note: string, secondsOnIt: number): string {
  if (secondsOnIt < PATIENCE_AFTER_SECONDS) return note
  const dots = '.'.repeat(Math.floor(secondsOnIt) % 4)
  return `${L({ pt: 'Ainda trabalhando nisso', en: 'Still working on it', es: 'Todavía trabajando en eso' })}${dots}`
}
