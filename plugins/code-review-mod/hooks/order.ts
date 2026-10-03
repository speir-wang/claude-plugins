import type { Finding, Group } from '../types'

export type Row = { finding: Finding; isGrey: boolean }

export type Section = {
  group: Group | 'comment'
  label: string
  /** Said under the label when the section has no rows; null when it has rows. */
  note: string | null
  rows: Row[]
}

const LABELS = { standards: 'Standards', spec: 'Spec', comment: 'Your comments' } as const

/**
 * Splits findings into the Standards and Spec sections, each sorted by score
 * (highest first, ties in the order they came). Scores 1-2 are greyed out.
 * Findings rebuilt from your GitHub comments have no score: they get a third
 * section, in the order posted, only when there are some.
 */
export function groupFindings(findings: Finding[], skipped: { group: Group; reason: string }[]): Section[] {
  const section = (group: Group | 'comment'): Section => {
    const rows = findings
      .filter(f => f.group === group)
      .sort((a, b) => b.score - a.score)
      .map(finding => ({ finding, isGrey: finding.score > 0 && finding.score <= 2 }))
    const skip = skipped.find(s => s.group === group)
    const note = rows.length > 0 ? null : skip === undefined ? 'nothing found' : `skipped, ${skip.reason}`

    return { group, label: LABELS[group], note, rows }
  }
  const comments = section('comment')

  return [section('standards'), section('spec'), ...(comments.rows.length > 0 ? [comments] : [])]
}
