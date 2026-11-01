import type { Finding, Reply, Said } from '../types'

type GitHubUser = { login: string; type?: string } | null

/** The fields of a GitHub PR review comment the re-check reads. */
export type GitHubComment = {
  id: number
  user: GitHubUser
  in_reply_to_id?: number
  path: string
  line: number | null
  original_line?: number | null
  body: string
  original_commit_id?: string
}

/** The fields of a GitHub PR review the re-check reads. */
export type GitHubReview = { user: GitHubUser; commit_id: string; submitted_at: string | null; state: string; body?: string | null }

/** The fields of a comment in the PR conversation the re-check reads. */
export type GitHubIssueComment = { user: GitHubUser; body: string; created_at: string }

/** The first line of a comment, as a short title. */
function titleOf(body: string): string {
  const first = body.trim().split('\n')[0]?.trim() ?? ''

  return first.length > 70 ? `${first.slice(0, 69)}…` : first
}

/** A comment as a reply; `isMine` when you wrote it. */
function replyOf(user: GitHubUser, body: string, me: string): Reply {
  const author = user?.login ?? ''

  return author === me ? { author, body: body.trim(), isMine: true } : { author, body: body.trim() }
}

/**
 * Every reply on the thread `start` begins, yours included, so an agreement
 * you gave in the thread is read too. GitHub points every reply at the
 * thread's first comment, and ids grow with time, so a larger id is a later
 * comment.
 */
function repliesTo(start: GitHubComment, comments: GitHubComment[], me: string): Reply[] {
  return comments
    .filter(c => c.in_reply_to_id === start.id && c.user !== null)
    .sort((a, b) => a.id - b.id)
    .map(c => replyOf(c.user, c.body, me))
}

/** The PR conversation: its comments and the review bodies, from people (bots left out), oldest first. */
export function discussionOf(conversation: GitHubIssueComment[], reviews: GitHubReview[], me: string): Reply[] {
  const said = [
    ...conversation.map(c => ({ user: c.user, body: c.body, at: c.created_at })),
    ...reviews.filter(r => r.submitted_at !== null).map(r => ({ user: r.user, body: r.body ?? '', at: r.submitted_at ?? '' })),
  ]

  return said
    .filter(c => c.user !== null && c.user.type !== 'Bot' && c.body.trim() !== '')
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(c => replyOf(c.user, c.body, me))
}

/**
 * Rebuilds a review from your own comments on GitHub: one finding per comment
 * that starts a thread (replies don't count; resolved threads do), marked
 * posted, with every reply on its thread. `base` is the commit your latest
 * submitted review was made on, else the commit of your newest comment.
 * `discussion` is the PR conversation. Nothing when you have no comments there.
 */
export function rebuild(
  comments: GitHubComment[],
  reviews: GitHubReview[],
  me: string,
  conversation: GitHubIssueComment[] = [],
): { findings: Finding[]; base: string; discussion: Reply[] } | null {
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
      level: null,
      confidence: 'confirmed',
      file: c.path,
      line: c.line ?? c.original_line ?? 1,
      title: titleOf(c.body),
      now: '',
      suggested: '',
      why: '',
      scenario: '',
      evidence: '',
      draft: { text: c.body, hasCode: false },
      status: 'posted',
      replies: repliesTo(c, comments, me),
    }),
  )

  return { findings, base, discussion: discussionOf(conversation, reviews, me) }
}

/**
 * The threads other people (bots included) started on the PR's lines, each
 * with every reply on it, oldest first. Your own threads are left out: the
 * rebuilt findings hold them.
 */
export function othersThreads(comments: GitHubComment[], me: string): Said[] {
  return comments
    .filter(c => c.user !== null && c.user.login !== me && c.in_reply_to_id === undefined)
    .sort((a, b) => a.id - b.id)
    .map(c => ({ author: c.user?.login ?? '', body: c.body.trim(), file: c.path, line: c.line ?? c.original_line ?? 1, replies: repliesTo(c, comments, me) }))
}

/** How long one comment may be when listed for Claude; a bot's can run to pages. */
const SAID_MAX = 400

function clip(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()

  return flat.length > SAID_MAX ? `${flat.slice(0, SAID_MAX - 1)}…` : flat
}

/** One thread as Claude reads it, on one line. */
export function saidLine(said: Said): string {
  const replies = said.replies.map(r => `${r.isMine === true ? 'you' : r.author} replied: "${clip(r.body)}"`)

  return [`${said.author} on ${said.file}:${said.line}: "${clip(said.body)}"`, ...replies].join(' — ')
}

/** The threads others started within `near` lines of a line. */
export function threadsNear(others: Said[], file: string, line: number, near = 3): Said[] {
  return others.filter(s => s.file === file && Math.abs(s.line - line) <= near)
}
