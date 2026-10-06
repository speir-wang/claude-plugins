import type { Finding, FindingStatus, ReviewInput } from '../../types'

import { OUTCOME_LABELS } from '../recheck'

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** The icon and color of each re-check answer, shared by the tool row and the panel row. */
const OUTCOME_LOOKS = {
  addressed: { icon: '✅', color: 'green' },
  wrong: { icon: '⚠️', color: 'yellow' },
  missed: { icon: '❌', color: 'red' },
} as const

type Tag = { text: string; color: 'yellow' | 'green' | undefined }

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
    const look = input.outcome === 'addressed' || input.outcome === 'wrong' ? OUTCOME_LOOKS[input.outcome] : OUTCOME_LOOKS.missed
    return { ...look, text: `#${String(number)} ${text(input.note)}` }
  }

  return { icon: '•', color: undefined, text: `#${String(number)} ${text(input.status)}` }
}

/** Cuts or pads text to exactly `width` cells (one cell per character). */
export function fit(text: string, width: number): string {
  if (width <= 1) {
    return ''
  }
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

/** The score as the row shows it: `9/10`, or a dash for a finding rebuilt from a comment. */
export function scoreText(finding: Finding): string {
  return finding.score === 0 ? '—' : `${finding.score}/10`
}

/** "must fix" for a broken written rule; nothing for a judgement call, where the score says enough. */
export function weightText(finding: Finding): string {
  return finding.group !== 'comment' && finding.weight === 'must' ? 'must fix' : ''
}

/** One finding row: score, "must fix" when a rule is broken, file name:line and the title, cut to `width`. */
export function findingLabel(finding: Finding, width: number): string {
  const name = finding.file.split('/').at(-1) ?? finding.file

  return fit(`${scoreText(finding).padStart(5)} ${weightText(finding).padEnd(8)} ${name}:${finding.line}  ${finding.title}`, width).trimEnd()
}

/** The note after a row for a finding that is no longer open; null while it is open. */
export function statusTag(status: FindingStatus): Tag | null {
  const tags: Record<FindingStatus, Tag | null> = {
    open: null,
    queued: { text: 'in fix list', color: 'yellow' },
    fixing: { text: 'fixing', color: 'yellow' },
    fixed: { text: '✔ fixed', color: 'green' },
    wontfix: { text: "won't fix", color: undefined },
    pending: { text: 'in review', color: 'yellow' },
    posted: { text: '✔ posted', color: 'green' },
    dropped: { text: 'dropped', color: undefined },
  }

  return tags[status]
}

/** "author replied" after a row whose GitHub thread has replies since your last comment. */
export function replyTag(finding: Finding): Tag | null {
  return (finding.replies ?? []).length > 0 ? { text: 'author replied', color: 'yellow' } : null
}

/** The re-check's answer after a row, when there is one. */
export function outcomeTag(finding: Finding): { text: string; color: 'yellow' | 'green' | 'red' } | null {
  if (finding.outcome === undefined) {
    return null
  }
  const { icon, color } = OUTCOME_LOOKS[finding.outcome]

  return { text: `${icon} ${OUTCOME_LABELS[finding.outcome]}`, color }
}
