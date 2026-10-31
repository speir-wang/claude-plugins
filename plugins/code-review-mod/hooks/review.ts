import type { Finding, FindingStatus, Group, Level, Mode, Review } from '../types'

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
  return { ...review, rounds: [...review.rounds, { n: currentRound(review) + 1, head }] }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const LEVEL_NAMES: Level[] = ['low', 'medium', 'high', 'xhigh']

/** How each level sorts: higher first. A finding with no level sorts last. */
export function levelRank(level: Level | null): number {
  return level === null ? 0 : LEVEL_NAMES.indexOf(level) + 1
}

/** Reads one finding from the tool's input; a sentence naming what is wrong when it can't. */
export function readFinding(input: Record<string, unknown>, review: Review): Finding | string {
  const { group, level, confidence, line } = input
  if (group !== 'standards' && group !== 'spec') {
    return '"group" must be "standards" or "spec".'
  }
  if (!LEVEL_NAMES.includes(level as Level)) {
    return '"level" must be "low", "medium", "high" or "xhigh".'
  }
  if (text(input.file).trim() === '' || text(input.title).trim() === '') {
    return '"file" and "title" are needed.'
  }
  const scenario = text(input.scenario).trim()
  const evidence = text(input.evidence).trim()
  const isHigh = level === 'high' || level === 'xhigh'
  if (isHigh && (scenario === '' || evidence === '')) {
    return `"${String(level)}" needs "scenario" (what goes wrong) and "evidence" (the code you read, as file:line ranges). Without them the level is "medium" at most.`
  }
  if (isHigh && confidence !== 'confirmed' && confidence !== 'likely') {
    return `"${String(level)}" needs "confidence": "confirmed" or "likely".`
  }
  if (confidence !== undefined && confidence !== 'confirmed' && confidence !== 'likely') {
    return '"confidence" must be "confirmed" or "likely".'
  }
  const comment = text(input.comment).trim()

  return {
    n: review.findings.reduce((max, f) => Math.max(max, f.n), 0) + 1,
    round: currentRound(review),
    group,
    level: level as Level,
    confidence: confidence === 'likely' ? 'likely' : 'confirmed',
    file: text(input.file).trim(),
    line: typeof line === 'number' && line > 0 ? Math.floor(line) : 1,
    title: text(input.title).trim(),
    now: text(input.now),
    suggested: text(input.suggested),
    why: text(input.why).trim(),
    scenario,
    evidence,
    draft: comment === '' ? null : { text: comment, hasCode: text(input.suggested).trim() !== '' },
    status: 'open',
  }
}

/** The fields "edit" may change. */
export const EDITABLE = ['group', 'level', 'confidence', 'file', 'line', 'title', 'now', 'suggested', 'why', 'scenario', 'evidence', 'comment'] as const

/**
 * One finding with the fields given in `input` changed, checked the same way
 * as "add"; a sentence naming what is wrong when it can't. Its number, round,
 * status, replies and outcome stay. The draft changes only when "comment" or
 * "suggested" is given: "comment" "" removes it.
 */
export function editFinding(input: Record<string, unknown>, finding: Finding, review: Review): Finding | string {
  const given = EDITABLE.filter(key => input[key] !== undefined)
  if (given.length === 0) {
    return `Nothing to change: give one of ${EDITABLE.join(', ')}.`
  }
  const merged = {
    group: finding.group,
    level: finding.level,
    confidence: finding.confidence,
    file: finding.file,
    line: finding.line,
    title: finding.title,
    now: finding.now,
    suggested: finding.suggested,
    why: finding.why,
    scenario: finding.scenario,
    evidence: finding.evidence,
    comment: finding.draft?.text ?? '',
    ...Object.fromEntries(given.map(key => [key, input[key]])),
  }
  const read = readFinding(merged, review)
  if (typeof read === 'string') {
    return read
  }
  const isDraftChanged = given.includes('comment') || given.includes('suggested')

  return { ...finding, ...read, n: finding.n, round: finding.round, status: finding.status, draft: isDraftChanged ? read.draft : finding.draft }
}

/** The level an old 1-10 score maps to: 9-10 xhigh, 6-8 high, 3-5 medium, 1-2 low, 0 none. */
function levelOfScore(score: number): Level | null {
  return score >= 9 ? 'xhigh' : score >= 6 ? 'high' : score >= 3 ? 'medium' : score >= 1 ? 'low' : null
}

/** A review saved before levels (v1.2.0 and older): each score becomes a level, and the must/maybe marker goes. */
export function upgradeReview(review: Review): Review {
  const findings = review.findings.map(f => {
    if ('level' in f) {
      return f
    }
    const { score, weight: _weight, ...rest } = f as Omit<Finding, 'level' | 'confidence' | 'scenario' | 'evidence'> & { score?: number; weight?: string }
    return { ...rest, level: levelOfScore(score ?? 0), confidence: 'confirmed' as const, scenario: '', evidence: '' }
  })

  return { ...review, findings }
}

/** Marks a group as not run this round; a later call for the same group replaces the reason. */
export function skipGroup(review: Review, group: Group, reason: string): Review {
  const round = currentRound(review)

  return { ...review, skipped: [...review.skipped.filter(s => s.group !== group || s.round !== round), { group, reason, round }] }
}

/** Changes one finding. */
export function changeFinding(review: Review, n: number, change: (finding: Finding) => Finding): Review {
  return { ...review, findings: review.findings.map(f => (f.n === n ? change(f) : f)) }
}

/** Deletes one finding. The other numbers stay, so "fix 3" still means the same row. */
export function removeFinding(review: Review, n: number): Review {
  return { ...review, findings: review.findings.filter(f => f.n !== n) }
}

/** Sets one finding's status. */
export function setStatus(review: Review, n: number, status: FindingStatus): Review {
  return changeFinding(review, n, f => ({ ...f, status }))
}

/** How many findings are open, pending (being fixed, or waiting to be posted) and done. */
export function counts(review: Review): { open: number; pending: number; done: number } {
  const is = (...statuses: FindingStatus[]) => review.findings.filter(f => statuses.includes(f.status)).length

  return { open: is('open'), pending: is('queued', 'fixing', 'pending'), done: is('fixed', 'wontfix', 'posted', 'dropped') }
}

/**
 * The step to suggest once nothing is left: approve their PR when every
 * finding is posted or dropped; create a PR for your branch when every one
 * is fixed or won't fix and it isn't on GitHub yet. Nothing while a re-check
 * says a fix is missing or wrong.
 */
export function nextStep(review: Review): 'approve' | 'create' | null {
  const isGitHub = /^[\w.-]+\/[\w.-]+#\d+$/.test(review.pr)
  // A re-check that found a fix missing or wrong leaves work to do, whatever the status says.
  const isUnfixed = review.findings.some(f => f.outcome === 'wrong' || f.outcome === 'missed')
  const isLeft = (...done: FindingStatus[]) => isUnfixed || review.findings.some(f => !done.includes(f.status))
  if (review.mode === 'theirs') {
    return isGitHub && !isLeft('posted', 'dropped') ? 'approve' : null
  }

  return !isGitHub && review.hasPr !== true && !isLeft('fixed', 'wontfix') ? 'create' : null
}
