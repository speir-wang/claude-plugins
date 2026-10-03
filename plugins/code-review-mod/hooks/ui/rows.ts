import type { ReviewInput } from '../../types'

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** The icon, color and text of the one-line tool row. */
export function toolRowLine(input: ReviewInput): { icon: string; color: 'yellow' | 'green' | 'red' | undefined; text: string } {
  const { action, number } = input
  if (action === 'start') {
    return { icon: '◇', color: 'yellow', text: `Review of ${text(input.pr)}` }
  }
  if (action === 'add') {
    return { icon: '•', color: undefined, text: `${String(input.score)} · ${text(input.title)}` }
  }
  if (action === 'skipped') {
    return { icon: '⊘', color: undefined, text: `${text(input.group)} skipped: ${text(input.reason)}` }
  }
  if (action === 'outcome') {
    const look = input.outcome === 'addressed' ? { icon: '✅', color: 'green' as const } : input.outcome === 'wrong' ? { icon: '⚠️', color: 'yellow' as const } : { icon: '❌', color: 'red' as const }
    return { ...look, text: `#${String(number)} ${text(input.note)}` }
  }

  return { icon: '•', color: undefined, text: `#${String(number)} ${text(input.status)}` }
}
