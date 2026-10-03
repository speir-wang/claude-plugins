import type { Finding, FindingStatus, Group, Mode, Review } from '../types'

/** A new review with its first round. */
export function newReview(pr: string, mode: Mode, head: string): Review {
  return { pr, mode, rounds: [{ n: 1, head }], findings: [], skipped: [] }
}

/** The round in progress: the last one. */
export function currentRound(review: Review): number {
  return review.rounds.at(-1)?.n ?? 1
}

/** Starts the next round from `head`. */
export function nextRound(review: Review, head: string): Review {
  return { ...review, rounds: [...review.rounds, { n: currentRound(review) + 1, head }], skipped: [] }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** Reads one finding from the tool's input; a sentence naming what is wrong when it can't. */
export function readFinding(input: Record<string, unknown>, review: Review): Finding | string {
  const { group, weight, score, line } = input
  if (group !== 'standards' && group !== 'spec') {
    return '"group" must be "standards" or "spec".'
  }
  if (weight !== 'must' && weight !== 'maybe') {
    return '"weight" must be "must" or "maybe".'
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) {
    return '"score" must be a whole number from 1 to 10.'
  }
  if (text(input.file).trim() === '' || text(input.title).trim() === '') {
    return '"file" and "title" are needed.'
  }
  const comment = text(input.comment).trim()

  return {
    n: review.findings.reduce((max, f) => Math.max(max, f.n), 0) + 1,
    round: currentRound(review),
    group,
    weight,
    score,
    file: text(input.file).trim(),
    line: typeof line === 'number' && line > 0 ? Math.floor(line) : 1,
    title: text(input.title).trim(),
    now: text(input.now),
    suggested: text(input.suggested),
    why: text(input.why).trim(),
    draft: comment === '' ? null : { text: comment, hasCode: text(input.suggested).trim() !== '' },
    status: 'open',
  }
}

/** Marks a group as not run this round; a later call for the same group replaces the reason. */
export function skipGroup(review: Review, group: Group, reason: string): Review {
  return { ...review, skipped: [...review.skipped.filter(s => s.group !== group), { group, reason }] }
}

/** Changes one finding. */
export function changeFinding(review: Review, n: number, change: (finding: Finding) => Finding): Review {
  return { ...review, findings: review.findings.map(f => (f.n === n ? change(f) : f)) }
}

/** Sets one finding's status. */
export function setStatus(review: Review, n: number, status: FindingStatus): Review {
  return changeFinding(review, n, f => ({ ...f, status }))
}
