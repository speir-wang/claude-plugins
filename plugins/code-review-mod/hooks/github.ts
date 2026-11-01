import type { Finding, Reply, ReviewEvent, Said } from '../types'

import { discussionOf, othersThreads, rebuild } from './comments'
import type { GitHubComment, GitHubIssueComment, GitHubReview } from './comments'
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

/** Reads a JSON-lines answer (`--jq '.[] | @json'`) into its items; bad lines are skipped. */
export function jsonLines<T>(text: string): T[] {
  return text
    .split('\n')
    .filter(line => line.trim() !== '')
    .flatMap(line => {
      try {
        return [JSON.parse(line) as T]
      } catch {
        return []
      }
    })
}

/**
 * Reads what is on their PR so far. `rebuilt`: the review rebuilt from your own
 * comments, for a re-check in any session; nothing when you have none or gh
 * can't tell who you are. `others`: the threads other people started on its
 * lines. `discussion`: the PR conversation. Nothing when `pr` is not a PR.
 */
export async function readPrComments(
  p: Run,
  pr: string,
): Promise<{ rebuilt: { findings: Finding[]; base: string; discussion: Reply[] } | null; others: Said[]; discussion: Reply[] } | null> {
  const place = splitPr(pr)
  if (place === undefined) {
    return null
  }
  const me = (await p.run(['gh', 'api', 'user', '--jq', '.login'])).stdout.trim()
  const list = async (path: string) => {
    const ran = await p.run(['gh', 'api', `repos/${place.repo}/${path}`, '--paginate', '--jq', '.[] | @json'])
    return ran.exitCode === 0 ? ran.stdout : ''
  }
  const comments = jsonLines<GitHubComment>(await list(`pulls/${place.number}/comments`))
  const reviews = jsonLines<GitHubReview>(await list(`pulls/${place.number}/reviews`))
  // The PR conversation lives on the issue behind the PR.
  const conversation = jsonLines<GitHubIssueComment>(await list(`issues/${place.number}/comments`))

  return {
    rebuilt: me === '' ? null : rebuild(comments, reviews, me, conversation),
    others: othersThreads(comments, me),
    discussion: discussionOf(conversation, reviews, me),
  }
}

/** Whether the branch already has a PR on GitHub; false when gh can't tell. */
export async function hasPr(p: Run, branch: string): Promise<boolean> {
  const ran = await p.run(['gh', 'pr', 'view', branch, '--json', 'number', '--jq', '.number'])

  return ran.exitCode === 0 && ran.stdout.trim() !== ''
}

/** Approves the PR. Answers what went wrong, or nothing. */
export async function approvePr(p: Run, pr: string): Promise<string | undefined> {
  const place = splitPr(pr)
  if (place === undefined) {
    return `${pr} is not a GitHub PR.`
  }
  const ran = await p.run(['gh', 'pr', 'review', String(place.number), '-R', place.repo, '--approve'])

  return ran.exitCode === 0 ? undefined : why(ran)
}
