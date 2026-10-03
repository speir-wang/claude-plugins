import type { Finding, FindingStatus, Group, Incoming, Outcome, Review, ReviewInput } from '../types'

import { startFix } from './actions'

import { TOOL_NAME } from './config'
import { readMyComments } from './github'
import { pickMode } from './mode'
import { applyOutcome, checkLine, toCheck } from './recheck'
import type { Ports } from './ports'
import { currentRound, newReview, nextRound, readFinding, setStatus, skipGroup } from './review'

/** The review tool, as it is registered. */
export const TOOL_SPEC = {
  name: TOOL_NAME,
  description:
    "The user's review panel for the code-review skill. Record the review here, not in the chat. " +
    '"start" opens a review or a re-check (pr, mode, head). "add" records one finding. ' +
    '"skipped" says a group did not run. "outcome" records a re-check result for one finding. ' +
    '"set-status" changes one finding\'s status. Each call answers in one line.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['start', 'add', 'skipped', 'outcome', 'set-status'] },
      pr: { type: 'string', description: 'For "start": owner/repo#number for a PR link, else the branch name.' },
      mode: { type: 'string', enum: ['mine', 'theirs'], description: 'For "start": "theirs" for a PR link, "mine" for the user\'s own branch.' },
      head: { type: 'string', description: 'For "start": the full hash of the commit reviewed.' },
      group: { type: 'string', enum: ['standards', 'spec'], description: 'For "add" and "skipped".' },
      weight: { type: 'string', enum: ['must', 'maybe'], description: 'For "add": "must" for a broken written rule, "maybe" for a judgement call.' },
      score: { type: 'integer', minimum: 1, maximum: 10, description: 'For "add": 9-10 bug or broken spec, 6-8 fix before merge, 3-5 nice to have, 1-2 nitpick.' },
      file: { type: 'string', description: 'For "add": the file, relative to the repo root.' },
      line: { type: 'integer', minimum: 1, description: 'For "add": the line in the new code.' },
      title: { type: 'string', description: 'For "add": a short title.' },
      now: { type: 'string', description: 'For "add": the code as it is now.' },
      suggested: { type: 'string', description: 'For "add": the suggested code, or "" when there is none.' },
      why: { type: 'string', description: 'For "add": why it matters, written for the user.' },
      comment: { type: 'string', description: 'For "add" on their PR: the comment for the author, without the code.' },
      reason: { type: 'string', description: 'For "skipped": why the group did not run.' },
      number: { type: 'integer', minimum: 1, description: 'For "outcome" and "set-status": the finding\'s number.' },
      outcome: { type: 'string', enum: ['addressed', 'wrong', 'missed'], description: 'For "outcome".' },
      note: { type: 'string', description: 'For "outcome": one line on why.' },
      status: { type: 'string', enum: ['open', 'fixing', 'fixed', 'wontfix'], description: 'For "set-status".' },
    },
    required: ['action'],
  },
}

export type ToolAnswer = { text: string; isError?: true }

/** What serving the tool needs. */
export type ToolPorts = Pick<Ports, 'review' | 'incoming' | 'isChanged' | 'toolNames' | 'callTool' | 'run'>

const fail = (text: string): ToolAnswer => ({ text, isError: true })

/** What a new round tells Claude: the findings to check, and where to review from. One line. */
function recheckAnswer(review: Review): string {
  const round = currentRound(review)
  const since = review.rounds.at(-2)?.head ?? ''
  const checks = toCheck(review).map(checkLine)
  const todo =
    checks.length === 0
      ? 'No findings to check.'
      : `Check each of these and record it with "outcome": ${checks.join('; ')}.`

  return `Round ${round} of ${review.pr} started. ${todo} Then review every commit since ${since.slice(0, 7)} (${since}..HEAD) and record new problems with "add".`
}

/** A review of their PR rebuilt from your GitHub comments, its re-check round open at `head`. */
function fromComments(pr: string, head: string, rebuilt: { findings: Finding[]; base: string }): Review {
  return { pr, mode: 'theirs', rounds: [{ n: 1, head: rebuilt.base }, { n: 2, head }], findings: rebuilt.findings, skipped: [] }
}

/** Opens a review, or the next round of the same one. */
async function start(p: ToolPorts, input: ReviewInput): Promise<ToolAnswer> {
  const pr = typeof input.pr === 'string' ? input.pr.trim() : ''
  const head = typeof input.head === 'string' ? input.head.trim() : ''
  if (pr === '' || head === '') {
    return fail('"pr" and "head" are needed.')
  }
  const waiting = await p.incoming.get()
  if (waiting?.answer === 'ask' && waiting.review.pr === pr) {
    return { text: `Review of ${pr} is open. The panel asks the user whether it replaces the one shown. Record findings as usual.` }
  }
  await p.incoming.update(() => null)
  const current = await p.review.get()
  if (current !== null && current.pr === pr) {
    if (current.rounds.at(-1)?.head === head) {
      return { text: `Round ${currentRound(current)} of ${pr} is open. Record findings with "add".` }
    }
    // On their PR, GitHub holds what was posted: every re-check starts from it.
    const rebuilt = current.mode === 'theirs' ? await readMyComments(p, pr) : null
    if (rebuilt !== null) {
      const fresh = fromComments(pr, head, rebuilt)
      await p.review.update(() => fresh)
      await p.isChanged.update(() => true)
      return { text: recheckAnswer(fresh) }
    }
    const next = await p.review.update(review => (review === null ? review : nextRound(review, head)))
    await p.isChanged.update(() => true)
    return next === null ? fail('No review is open.') : { text: recheckAnswer(next) }
  }
  const mode = pickMode(pr, input.mode)
  // Your earlier comments on their PR make this a re-check, in any session.
  const rebuilt = mode === 'theirs' ? await readMyComments(p, pr) : null
  const fresh = rebuilt === null ? newReview(pr, mode, head) : fromComments(pr, head, rebuilt)
  const opening = rebuilt === null ? `Review of ${pr} started (${mode === 'mine' ? 'your PR' : 'their PR'}).` : recheckAnswer(fresh)
  if (current !== null && current.findings.length > 0) {
    // The panel asks before replacing; the review goes on either way.
    await p.incoming.update(() => ({ review: fresh, answer: 'ask' }))
    return { text: `${opening} The panel asks the user whether it replaces the one shown; go on as usual.` }
  }
  await p.review.update(() => fresh)
  await p.isChanged.update(() => true)

  return { text: opening }
}

const OUTCOMES: Outcome[] = ['addressed', 'wrong', 'missed']

/** "outcome": a re-check result for one finding. */
async function recordOutcome(p: ToolPorts, review: Review, input: ReviewInput): Promise<ToolAnswer> {
  const { number, outcome } = input
  if (typeof number !== 'number' || !OUTCOMES.includes(outcome as Outcome)) {
    return fail('"number" and "outcome" ("addressed", "wrong" or "missed") are needed.')
  }
  const checked = applyOutcome(review, number, outcome as Outcome, typeof input.note === 'string' ? input.note : '')
  if (typeof checked === 'string') {
    return fail(checked)
  }
  await p.review.update(() => checked)
  await p.isChanged.update(() => true)

  return { text: `#${number}: ${outcome === 'addressed' ? 'addressed' : outcome === 'wrong' ? 'addressed wrongly' : 'not addressed'}` }
}

const STATUSES: FindingStatus[] = ['open', 'fixing', 'fixed', 'wontfix']

/** "set-status": "fixing" works like the Fix it button. */
async function changeStatus(p: ToolPorts, input: ReviewInput): Promise<ToolAnswer> {
  const { number, status } = input
  const finding = (await p.review.get())?.findings.find(f => f.n === number)
  if (finding === undefined || typeof number !== 'number') {
    return fail(`No finding number ${String(number)}.`)
  }
  if (!STATUSES.includes(status as FindingStatus)) {
    return fail('"status" must be "open", "fixing", "fixed" or "wontfix".')
  }
  if (status === 'fixing') {
    const started = await startFix(p, number)
    return started !== null && 'todo' in started
      ? { text: `#${number} is being fixed: added the todo "${started.todo}".` }
      : { text: `#${number} is being fixed. Fix it now, then set its status to "fixed".` }
  }
  await p.review.update(r => (r === null ? r : setStatus(r, number, status as FindingStatus)))

  return { text: `#${number} is ${status === 'wontfix' ? "won't fix" : status}.` }
}

/**
 * Records into the review waiting for the user's answer. Once they chose to
 * keep the old one, the new review's findings are let go, but Claude is told
 * all went well: the question only decides what the panel keeps.
 */
async function recordIncoming(p: ToolPorts, input: ReviewInput, waiting: Incoming): Promise<ToolAnswer> {
  if (input.action === 'skipped') {
    const group = input.group === 'spec' ? 'spec' : 'standards'
    await p.incoming.update(w => (w === null ? w : { ...w, review: skipGroup(w.review, group, typeof input.reason === 'string' ? input.reason : 'not run') }))
    return { text: `${group === 'spec' ? 'Spec' : 'Standards'} skipped.` }
  }
  const finding = readFinding(input, waiting.review)
  if (typeof finding === 'string') {
    return fail(`Not added: ${finding}`)
  }
  if (waiting.answer === 'ask') {
    await p.incoming.update(w => (w === null ? w : { ...w, review: { ...w.review, findings: [...w.review.findings, finding] } }))
  }

  return { text: `Added #${finding.n}: ${finding.title}` }
}

/** Serves the review tool. Every answer is one line. */
export async function runTool(p: ToolPorts, input: ReviewInput): Promise<ToolAnswer> {
  if (input.action === 'start') {
    return start(p, input)
  }
  if (input.action !== 'add' && input.action !== 'skipped' && input.action !== 'set-status' && input.action !== 'outcome') {
    return fail('Unknown action. Use "start", "add", "skipped", "outcome" or "set-status".')
  }
  const waiting = await p.incoming.get()
  if (waiting !== null && (input.action === 'add' || input.action === 'skipped')) {
    return recordIncoming(p, input, waiting)
  }
  const review = await p.review.get()
  if (review === null) {
    return fail('No review is open. Call "start" first.')
  }
  if (input.action === 'add') {
    const finding = readFinding(input, review)
    if (typeof finding === 'string') {
      return fail(`Not added: ${finding}`)
    }
    await p.review.update(r => (r === null ? r : { ...r, findings: [...r.findings, finding] }))
    await p.isChanged.update(() => true)
    return { text: `Added #${finding.n}: ${finding.title}` }
  }
  if (input.action === 'set-status') {
    return changeStatus(p, input)
  }
  if (input.action === 'outcome') {
    return recordOutcome(p, review, input)
  }
  const group = input.group
  if (group !== 'standards' && group !== 'spec') {
    return fail('"group" must be "standards" or "spec".')
  }
  const reason = typeof input.reason === 'string' && input.reason.trim() !== '' ? input.reason.trim() : 'not run'
  await p.review.update(r => (r === null ? r : skipGroup(r, group as Group, reason)))
  await p.isChanged.update(() => true)

  return { text: `${group === 'spec' ? 'Spec' : 'Standards'} skipped: ${reason}` }
}
