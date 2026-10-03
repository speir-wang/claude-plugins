import type { Finding, ReviewEvent } from '../types'

import { TOOL } from './config'
import { rewriteDraft } from './draft'
import { approvePr, postReview } from './github'
import { flipMode } from './mode'
import { renumber } from './order'
import type { Ports } from './ports'
import { changeFinding, setStatus } from './review'

type ViewPorts = Pick<Ports, 'view' | 'openPane'>

/** Shows one finding. Esc (or the panel's close mark) goes back, see the ui.close hook. */
export async function openFinding(p: ViewPorts & Pick<Ports, 'notice'>, n: number) {
  await p.notice.update(() => '')
  await p.view.update(() => ({ kind: 'finding', n }))
  await p.openPane({ closeOnEscape: true })
}

/** Shows the list again. */
export async function backToList(p: ViewPorts) {
  await p.view.update(() => ({ kind: 'list' }))
  await p.openPane()
}

/** Flips the review between your PR and their PR. */
export async function switchMode(p: Pick<Ports, 'review'>) {
  await p.review.update(review => (review === null ? review : { ...review, mode: flipMode(review.mode) }))
}

/** The prompt that asks Claude to fix every finding on the fix list, in one commit. */
export function fixAllPrompt(findings: Finding[]): string {
  const items = findings.flatMap(f => [
    `#${f.n} ${f.file}:${f.line}: ${f.title}`,
    `   ${f.why}`,
    ...(f.suggested.trim() === '' ? [] : ['   Suggested code:', '   ```', ...f.suggested.split('\n').map(line => `   ${line}`), '   ```']),
  ])

  return [
    'Fix these problems on my branch, all in one go:',
    '',
    ...items,
    '',
    'Make one commit for all of them. Write its message about the actual change, as for any normal commit: do not mention a review or these numbers.',
    `When they are fixed, call ${TOOL} "set-status" with status "fixed" for each number: ${findings.map(f => `#${f.n}`).join(', ')}.`,
  ].join('\n')
}

/** Add to fix list / Remove from fix list. Nothing is fixed until Fix all. */
export async function toggleQueued(p: Pick<Ports, 'review'> & ViewPorts, n: number) {
  await p.review.update(review =>
    review === null ? review : changeFinding(review, n, f => ({ ...f, status: f.status === 'queued' ? 'open' : 'queued' })),
  )
  await backToList(p)
}

/** Fix all, once confirmed: Claude fixes the whole fix list in one commit. */
export async function fixAll(p: Pick<Ports, 'review' | 'submit'> & ViewPorts) {
  const queued = (await p.review.get())?.findings.filter(f => f.status === 'queued') ?? []
  if (queued.length > 0) {
    const fixing = new Set(queued.map(f => f.n))
    await p.review.update(r => (r === null ? r : { ...r, findings: r.findings.map(f => (fixing.has(f.n) ? { ...f, status: 'fixing' as const } : f)) }))
    await p.submit(fixAllPrompt(queued))
  }
  await backToList(p)
}

/** The Won't fix button. */
export async function wontFix(p: Pick<Ports, 'review'> & ViewPorts, n: number) {
  await p.review.update(review => (review === null ? review : setStatus(review, n, 'wontfix')))
  await backToList(p)
}

/** The Ask Claude button: the finding goes in the prompt box, the user writes the question. */
export async function askAbout(p: Pick<Ports, 'review' | 'fill'>, n: number) {
  const finding = (await p.review.get())?.findings.find(f => f.n === n)
  if (finding !== undefined) {
    await p.fill(`About review finding #${n} (${finding.title}, ${finding.file}:${finding.line}): `)
  }
}

/** The Drop button: skip a finding on their PR. */
export async function drop(p: Pick<Ports, 'review'> & ViewPorts, n: number) {
  await p.review.update(review => (review === null ? review : setStatus(review, n, 'dropped')))
  await backToList(p)
}

/** Shows the Edit or Rewrite field under the draft. */
export async function showInput(p: Pick<Ports, 'view' | 'notice'>, n: number, input: 'edit' | 'rewrite') {
  await p.notice.update(() => '')
  await p.view.update(() => ({ kind: 'finding', n, input }))
}

/** Saves an edited draft text. */
export async function saveEdit(p: Pick<Ports, 'review' | 'view'>, n: number, text: string) {
  if (text.trim() !== '') {
    await p.review.update(review =>
      review === null ? review : changeFinding(review, n, f => ({ ...f, draft: { text: text.trim(), hasCode: f.draft?.hasCode ?? f.suggested.trim() !== '' } })),
    )
  }
  await p.view.update(() => ({ kind: 'finding', n }))
}

/** Rewrites a draft from the user's note through Claude; on no answer the draft stays and the panel says so. */
export async function rewrite(p: Pick<Ports, 'review' | 'view' | 'notice' | 'complete'>, n: number, note: string) {
  const finding = (await p.review.get())?.findings.find(f => f.n === n)
  if (finding === undefined) {
    return
  }
  await p.view.update(() => ({ kind: 'finding', n, isRewriting: true }))
  const draft = await rewriteDraft(p, finding, note)
  if (draft === undefined) {
    await p.notice.update(() => 'Rewrite failed: Claude gave no usable answer. The draft is unchanged.')
  } else {
    await p.review.update(review => (review === null ? review : changeFinding(review, n, f => ({ ...f, draft }))))
  }
  await p.view.update(view => (view.kind === 'finding' && view.n === n ? { kind: 'finding', n } : view))
}

/** Add to review / Remove from review: moves a draft in or out of the pending pile. Nothing is posted. */
export async function togglePending(p: Pick<Ports, 'review'> & ViewPorts, n: number) {
  await p.review.update(review =>
    review === null ? review : changeFinding(review, n, f => ({ ...f, status: f.status === 'pending' ? 'open' : 'pending' })),
  )
  await backToList(p)
}

/** Submit review: the confirm step, with Comment picked. */
export async function showSubmit(p: ViewPorts & Pick<Ports, 'notice'>) {
  await p.notice.update(() => '')
  await p.view.update(() => ({ kind: 'submit', event: 'COMMENT' }))
  await p.openPane({ closeOnEscape: true })
}

/** Picks Comment, Request changes or Approve in the confirm step. */
export async function pickEvent(p: Pick<Ports, 'view'>, event: ReviewEvent) {
  await p.view.update(view => (view.kind === 'submit' ? { ...view, event } : view))
}

/** Posts every pending draft as one review; on success they are posted, else they stay and the panel says why. */
export async function submitReview(p: Pick<Ports, 'review' | 'view' | 'notice' | 'run' | 'openPane'>) {
  const review = await p.review.get()
  const view = await p.view.get()
  if (review === null || view.kind !== 'submit') {
    return
  }
  const pending = review.findings.filter(f => f.status === 'pending')
  const failed = await postReview(p, review.pr, review.rounds.at(-1)?.head ?? '', view.event, pending)
  if (failed !== undefined) {
    await p.notice.update(() => `Not posted: ${failed}`)
    return
  }
  const posted = new Set(pending.map(f => f.n))
  await p.review.update(r => (r === null ? r : { ...r, findings: r.findings.map(f => (posted.has(f.n) ? { ...f, status: 'posted' as const } : f)) }))
  await p.notice.update(() => '')
  await backToList(p)
}

/** Replace: the review that came in takes the place of the one shown. */
export async function replaceReview(p: Pick<Ports, 'review' | 'incoming'> & ViewPorts) {
  const waiting = await p.incoming.get()
  if (waiting !== null) {
    await p.review.update(() => waiting.review)
    await p.incoming.update(() => null)
  }
  await backToList(p)
}

/** Keep: the review shown stays; what the new one records is let go. */
export async function keepReview(p: Pick<Ports, 'incoming'>) {
  await p.incoming.update(waiting => (waiting === null ? null : { ...waiting, answer: 'keep' }))
}

/** The Re-check button: asks Claude to re-check, the same as saying it. */
export async function recheck(p: Pick<Ports, 'review' | 'submit'>) {
  const review = await p.review.get()
  if (review !== null) {
    await p.submit(`Re-check the code review of ${review.pr}: call ${TOOL} "start" with pr "${review.pr}" and the current HEAD, then follow its answer.`)
  }
}

/** Approve PR / Create PR: the confirm step first. */
export async function showConfirm(p: ViewPorts & Pick<Ports, 'notice'>, step: 'approve' | 'create' | 'fix') {
  await p.notice.update(() => '')
  await p.view.update(() => ({ kind: 'confirm', step }))
  await p.openPane({ closeOnEscape: true })
}

/** Runs the confirmed step: approve on GitHub, or ask Claude to create the PR. */
export async function confirmStep(p: ViewPorts & Pick<Ports, 'review' | 'notice' | 'run' | 'submit'>) {
  const review = await p.review.get()
  const view = await p.view.get()
  if (review === null || view.kind !== 'confirm') {
    return
  }
  if (view.step === 'fix') {
    await fixAll(p)
    return
  }
  if (view.step === 'create') {
    await p.submit(`Create a GitHub PR for the branch ${review.pr}: push it, then run gh pr create with a short title and a description written from its commits.`)
    await backToList(p)
    return
  }
  const failed = await approvePr(p, review.pr)
  await p.notice.update(() => (failed === undefined ? `Approved ${review.pr}.` : `Not approved: ${failed}`))
  await backToList(p)
}

/** Once a review round ends, numbers its rows top to bottom; a finding that is open keeps showing. */
export async function numberRows(p: Pick<Ports, 'review' | 'view'>) {
  const current = await p.review.get()
  if (current === null) {
    return
  }
  const { review, moved } = renumber(current)
  await p.review.update(() => review)
  await p.view.update(view => (view.kind === 'finding' ? { ...view, n: moved.get(view.n) ?? view.n } : view))
}
