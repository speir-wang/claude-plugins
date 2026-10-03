import type { FindingStatus, Group, ReviewInput } from '../types'

import { startFix } from './actions'

import { TOOL_NAME } from './config'
import { pickMode } from './mode'
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
export type ToolPorts = Pick<Ports, 'review' | 'isChanged' | 'toolNames' | 'callTool'>

const fail = (text: string): ToolAnswer => ({ text, isError: true })

/** Opens a review, or the next round of the same one. */
async function start(p: ToolPorts, input: ReviewInput): Promise<ToolAnswer> {
  const pr = typeof input.pr === 'string' ? input.pr.trim() : ''
  const head = typeof input.head === 'string' ? input.head.trim() : ''
  if (pr === '' || head === '') {
    return fail('"pr" and "head" are needed.')
  }
  const current = await p.review.get()
  if (current !== null && current.pr === pr) {
    if (current.rounds.at(-1)?.head === head) {
      return { text: `Round ${currentRound(current)} of ${pr} is open. Record findings with "add".` }
    }
    const next = await p.review.update(review => (review === null ? review : nextRound(review, head)))
    return { text: `Round ${next === null ? 1 : currentRound(next)} of ${pr} started.` }
  }
  const mode = pickMode(pr, input.mode)
  await p.review.update(() => newReview(pr, mode, head))

  return { text: `Review of ${pr} started (${mode === 'mine' ? 'your PR' : 'their PR'}).` }
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

/** Serves the review tool. Every answer is one line. */
export async function runTool(p: ToolPorts, input: ReviewInput): Promise<ToolAnswer> {
  if (input.action === 'start') {
    return start(p, input)
  }
  const review = await p.review.get()
  if (input.action !== 'add' && input.action !== 'skipped' && input.action !== 'set-status') {
    return fail('Unknown action. Use "start", "add", "skipped", "outcome" or "set-status".')
  }
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
  const group = input.group
  if (group !== 'standards' && group !== 'spec') {
    return fail('"group" must be "standards" or "spec".')
  }
  const reason = typeof input.reason === 'string' && input.reason.trim() !== '' ? input.reason.trim() : 'not run'
  await p.review.update(r => (r === null ? r : skipGroup(r, group as Group, reason)))
  await p.isChanged.update(() => true)

  return { text: `${group === 'spec' ? 'Spec' : 'Standards'} skipped: ${reason}` }
}
