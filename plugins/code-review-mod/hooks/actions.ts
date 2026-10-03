import type { Finding } from '../types'

import { TODO_TOOL, TOOL } from './config'
import { flipMode } from './mode'
import type { Ports } from './ports'
import { setStatus } from './review'

type ViewPorts = Pick<Ports, 'view' | 'openPane'>

/** Shows one finding. Esc (or the panel's close mark) goes back, see the ui.close hook. */
export async function openFinding(p: ViewPorts, n: number) {
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
