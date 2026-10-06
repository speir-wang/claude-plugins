import { expect, test } from 'claude-code/testing'

import { rebuild } from '../hooks/comments'
import type { GitHubComment, GitHubReview } from '../hooks/comments'

const C1 = '1'.repeat(40)
const C2 = '2'.repeat(40)

const comment = (id: number, login: string, extra: Partial<GitHubComment> = {}): GitHubComment => ({
  id,
  user: { login },
  path: 'src/app.ts',
  line: 10 + id,
  original_line: 10 + id,
  body: `Comment ${id}?\nMore words.`,
  ...extra,
})

const reviewBy = (login: string, commit_id: string, submitted_at: string | null, state = 'COMMENTED'): GitHubReview => ({ user: { login }, commit_id, submitted_at, state })

test('only your thread-starting comments count; replies and other people\'s do not', () => {
  const rebuilt = rebuild(
    [comment(1, 'me'), comment(2, 'me', { in_reply_to_id: 1 }), comment(3, 'author'), comment(4, 'me')],
    [reviewBy('me', C1, '2026-10-01T10:00:00Z')],
    'me',
  )

  expect(rebuilt?.findings.map(f => [f.n, f.line, f.title])).toEqual([
    [1, 11, 'Comment 1?'],
    [2, 14, 'Comment 4?'],
  ])
  expect(rebuilt?.findings[0]).toMatchObject({ group: 'comment', score: 0, status: 'posted', round: 1, draft: { text: 'Comment 1?\nMore words.', hasCode: false } })
})

test('a comment on an outdated line keeps its first line number', () => {
  const rebuilt = rebuild([comment(1, 'me', { line: null, original_line: 7 })], [], 'me')

  expect(rebuilt?.findings[0]?.line).toBe(7)
})

test('the starting point is the commit of your latest submitted review', () => {
  const rebuilt = rebuild(
    [comment(1, 'me')],
    [
      reviewBy('me', C1, '2026-10-01T10:00:00Z'),
      reviewBy('me', C2, '2026-10-02T10:00:00Z'),
      reviewBy('me', 'pending', null, 'PENDING'),
      reviewBy('other', 'x'.repeat(40), '2026-10-03T10:00:00Z'),
    ],
    'me',
  )

  expect(rebuilt?.base).toBe(C2)
})

test('with no review found, the starting point is the newest comment\'s commit', () => {
  const rebuilt = rebuild([comment(1, 'me', { original_commit_id: C1 }), comment(2, 'me', { original_commit_id: C2 })], [], 'me')

  expect(rebuilt?.base).toBe(C2)
})

test('no comments of yours means nothing to rebuild', () => {
  expect(rebuild([comment(1, 'author')], [reviewBy('me', C1, '2026-10-01T10:00:00Z')], 'me')).toBeNull()
})

test('each finding keeps the others\' replies since your last comment on its thread', () => {
  const rebuilt = rebuild(
    [
      comment(1, 'me'),
      comment(2, 'author', { in_reply_to_id: 1, body: 'Why?' }),
      comment(3, 'me', { in_reply_to_id: 1, body: 'Because it leaks.' }),
      comment(5, 'author', { in_reply_to_id: 1, body: ' Fixed in #42. ' }),
      comment(4, 'me'),
    ],
    [],
    'me',
  )

  expect(rebuilt?.findings.map(f => f.replies)).toEqual([[{ author: 'author', body: 'Fixed in #42.' }], []])
})
