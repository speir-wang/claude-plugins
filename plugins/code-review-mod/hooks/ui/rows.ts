import type { Finding, FindingStatus, ReviewInput } from '../../types'

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
export function statusTag(status: FindingStatus): { text: string; color: 'yellow' | 'green' | undefined } | null {
  const tags: Record<FindingStatus, { text: string; color: 'yellow' | 'green' | undefined } | null> = {
    open: null,
    fixing: { text: 'fixing', color: 'yellow' },
    fixed: { text: '✔ fixed', color: 'green' },
    wontfix: { text: "won't fix", color: undefined },
    pending: { text: 'in review', color: 'yellow' },
    posted: { text: '✔ posted', color: 'green' },
    dropped: { text: 'dropped', color: undefined },
  }

  return tags[status]
}

/** The re-check's answer after a row, when there is one. */
export function outcomeTag(finding: Finding): { text: string; color: 'yellow' | 'green' | 'red' } | null {
  if (finding.outcome === undefined) {
    return null
  }
  const tags = {
    addressed: { text: '✅ addressed', color: 'green' },
    wrong: { text: '⚠️ addressed wrongly', color: 'yellow' },
    missed: { text: '❌ not addressed', color: 'red' },
  } as const

  return tags[finding.outcome]
}
