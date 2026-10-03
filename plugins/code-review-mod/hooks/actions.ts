import type { Finding, ReviewEvent } from '../types'

import { TODO_TOOL, TOOL } from './config'
import { rewriteDraft } from './draft'
import { postReview } from './github'
import { flipMode } from './mode'
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

/** The prompt that asks Claude to fix one finding now. */
function fixPrompt(f: Finding): string {
  return [
    `Fix review finding #${f.n}: ${f.title} (${f.file}:${f.line}).`,
    '',
    f.why,
    ...(f.suggested.trim() === '' ? [] : ['', 'Suggested code:', '```', f.suggested, '```']),
    '',
    `When it is fixed, call ${TOOL} "set-status" with number ${f.n} and status "fixed".`,
  ].join('\n')
}

type FixPorts = Pick<Ports, 'review' | 'toolNames' | 'callTool'>

/**
 * Marks a finding as being fixed. With todo-commits installed it becomes a
 * todo, so the fix gets its own commit; answers how it went, in one line.
 * Without it, answers the prompt that asks Claude to fix it now.
 */
export async function startFix(p: FixPorts, n: number): Promise<{ todo: string } | { prompt: string } | null> {
  const finding = (await p.review.get())?.findings.find(f => f.n === n)
  if (finding === undefined) {
    return null
  }
  await p.review.update(review => (review === null ? review : setStatus(review, n, 'fixing')))
  if ((await p.toolNames()).includes(TODO_TOOL)) {
    const title = `Fix review #${n}: ${finding.title}`
    await p.callTool(TODO_TOOL, { action: 'add', titles: [title] })
    return { todo: title }
  }

  return { prompt: fixPrompt(finding) }
}

/** The Fix it button: a todo, or a prompt to Claude when todo-commits is not there. */
export async function fixIt(p: FixPorts & ViewPorts & Pick<Ports, 'submit'>, n: number) {
  const started = await startFix(p, n)
  if (started !== null && 'prompt' in started) {
    await p.submit(started.prompt)
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
