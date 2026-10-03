import type { Finding, Outcome, Review } from '../types'

import { changeFinding, currentRound } from './review'

/** Each outcome in words, as the panel and the tool's answers say it. */
export const OUTCOME_LABELS: Record<Outcome, string> = { addressed: 'addressed', wrong: 'addressed wrongly', missed: 'not addressed' }

/**
 * The findings a re-check looks at: the ones you acted on in an earlier round.
 * On your PR that is "fix it" (fixing or fixed); on theirs, a posted comment.
 * Dropped and won't fix ones are left out.
 */
export function toCheck(review: Review): Finding[] {
  const acted = review.mode === 'mine' ? ['fixing', 'fixed'] : ['posted']

  return review.findings.filter(f => f.round < currentRound(review) && acted.includes(f.status))
}

/** One finding as the re-check lists it for Claude. */
export function checkLine(finding: Finding): string {
  return `#${finding.n} ${finding.file}:${finding.line} ${finding.title}`
}

/** Records a re-check outcome; a sentence naming the problem when the finding is not one to check. */
export function applyOutcome(review: Review, n: number, outcome: Outcome, note: string): Review | string {
  if (!toCheck(review).some(f => f.n === n)) {
    return `#${n} is not a finding to re-check. Check only the ones the "start" answer listed.`
  }

  return changeFinding(review, n, f => ({ ...f, outcome, outcomeNote: note.trim(), outcomeRound: currentRound(review) }))
}

export type RoundSummary = { n: number; found: number; addressed: number; wrong: number; missed: number }

/** Per round: what it found, and the outcomes its re-check gave. */
export function roundSummaries(review: Review): RoundSummary[] {
  return review.rounds.map(({ n }) => {
    const checked = review.findings.filter(f => f.outcomeRound === n)
    const count = (outcome: Outcome) => checked.filter(f => f.outcome === outcome).length

    return { n, found: review.findings.filter(f => f.round === n).length, addressed: count('addressed'), wrong: count('wrong'), missed: count('missed') }
  })
}
