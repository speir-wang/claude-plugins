import type { Finding, Group, Review } from '../types'

import { levelRank } from './review'

export type Row = { finding: Finding; isGrey: boolean }

export type Section = {
  group: Group | 'comment'
  label: string
  /** Said under the label when the section has no rows; null when it has rows. */
  note: string | null
  /** True when the group did not run, so its note is the reason rather than "nothing found". */
  isSkipped: boolean
  rows: Row[]
}

/** Each section's name, as the panel and the tool's answers say it. */
export const GROUP_LABELS = { standards: 'Standards', spec: 'Spec', comment: 'Your comments' } as const

/**
 * Splits findings into the Standards and Spec sections, each sorted by level
 * (xhigh first, ties in the order they came). "low" is greyed out.
 * Findings rebuilt from your GitHub comments have no level: they get a third
 * section, in the order posted, only when there are some.
 */
export function groupFindings(findings: Finding[], skipped: { group: Group; reason: string }[]): Section[] {
  const section = (group: Group | 'comment'): Section => {
    const rows = findings
      .filter(f => f.group === group)
      .sort((a, b) => levelRank(b.level) - levelRank(a.level))
      .map(finding => ({ finding, isGrey: finding.level === 'low' }))
    const skip = skipped.find(s => s.group === group)
    const note = rows.length > 0 ? null : skip === undefined ? 'nothing found' : `skipped, ${skip.reason}`

    return { group, label: GROUP_LABELS[group], note, isSkipped: skip !== undefined, rows }
  }
  const comments = section('comment')

  return [section('standards'), section('spec'), ...(comments.rows.length > 0 ? [comments] : [])]
}

/**
 * Numbers the round in progress the way the panel lists it: Standards then
 * Spec, by level, after every earlier round's numbers. Done once the round
 * ends, so "fix 3" means the third row. `moved` maps old numbers to new.
 */
export function renumber(review: Review): { review: Review; moved: Map<number, number> } {
  const round = review.rounds.at(-1)?.n ?? 1
  const before = review.findings.filter(f => f.round !== round).reduce((max, f) => Math.max(max, f.n), 0)
  const shown = groupFindings(review.findings.filter(f => f.round === round), []).flatMap(section => section.rows.map(row => row.finding.n))
  const moved = new Map(shown.map((n, i) => [n, before + i + 1]))

  return { review: { ...review, findings: review.findings.map(f => ({ ...f, n: moved.get(f.n) ?? f.n })) }, moved }
}
