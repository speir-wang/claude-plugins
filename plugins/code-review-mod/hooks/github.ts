import type { Finding, ReviewEvent } from '../types'

import { draftBody } from './draft'
import type { Ports } from './ports'

type Run = Pick<Ports, 'run'>

/** `owner/repo` and the number from `owner/repo#12`; nothing for a branch name. */
export function splitPr(pr: string): { repo: string; number: number } | undefined {
  const found = pr.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/)

  return found === null ? undefined : { repo: found[1]!, number: Number(found[2]) }
}

/** The first line of what went wrong, for the panel. */
function why(ran: { stderr: string; stdout: string }): string {
  return (ran.stderr.trim() || ran.stdout.trim() || 'gh failed').split('\n')[0]!
}

/** The body GitHub needs with "Request changes": said in the confirm step, so nothing is added behind the user's back. */
export const REQUEST_CHANGES_BODY = 'Requesting changes: see the comments on the lines.'

/** Posts the findings' drafts as one review, each comment on its line. Answers what went wrong, or nothing. */
export async function postReview(p: Run, pr: string, head: string, event: ReviewEvent, findings: Finding[]): Promise<string | undefined> {
  const place = splitPr(pr)
  if (place === undefined) {
    return `${pr} is not a GitHub PR. Flip the mode to your PR, or start the review from a PR link.`
  }
  const payload = {
    commit_id: head,
    event,
    ...(event === 'REQUEST_CHANGES' ? { body: REQUEST_CHANGES_BODY } : {}),
    comments: findings.map(f => ({
      path: f.file,
      line: f.line,
      side: 'RIGHT',
      body: draftBody(f.draft ?? { text: '', hasCode: true }, f.suggested),
    })),
  }
  const ran = await p.run(['gh', 'api', `repos/${place.repo}/pulls/${place.number}/reviews`, '--method', 'POST', '--input', '-'], JSON.stringify(payload))

  return ran.exitCode === 0 ? undefined : why(ran)
}
