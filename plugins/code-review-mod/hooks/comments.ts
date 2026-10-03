import type { Finding } from '../types'

/** The fields of a GitHub PR review comment the re-check reads. */
export type GitHubComment = {
  id: number
  user: { login: string } | null
  in_reply_to_id?: number
  path: string
  line: number | null
  original_line?: number | null
  body: string
  original_commit_id?: string
}

/** The fields of a GitHub PR review the re-check reads. */
export type GitHubReview = { user: { login: string } | null; commit_id: string; submitted_at: string | null; state: string }

/** The first line of a comment, as a short title. */
function titleOf(body: string): string {
  const first = body.trim().split('\n')[0]?.trim() ?? ''

  return first.length > 70 ? `${first.slice(0, 69)}…` : first
}

/**
 * Rebuilds a review from your own comments on GitHub: one finding per comment
 * that starts a thread (replies don't count; resolved threads do), marked
 * posted. `base` is the commit your latest submitted review was made on, else
 * the commit of your newest comment. Nothing when you have no comments there.
 */
export function rebuild(comments: GitHubComment[], reviews: GitHubReview[], me: string): { findings: Finding[]; base: string } | null {
  const mine = comments.filter(c => c.user?.login === me && c.in_reply_to_id === undefined)
  if (mine.length === 0) {
    return null
  }
  const latest = reviews
    .filter(r => r.user?.login === me && r.submitted_at !== null && r.state !== 'PENDING')
    .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
    .at(-1)
  const base = latest?.commit_id ?? mine.at(-1)?.original_commit_id ?? ''
  const findings = mine.map(
    (c, i): Finding => ({
      n: i + 1,
      round: 1,
      group: 'comment',
      weight: 'maybe',
      score: 0,
      file: c.path,
      line: c.line ?? c.original_line ?? 1,
      title: titleOf(c.body),
      now: '',
      suggested: '',
      why: '',
      draft: { text: c.body, hasCode: false },
      status: 'posted',
    }),
  )

  return { findings, base }
}
