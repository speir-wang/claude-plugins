import { expect, test } from 'claude-code/testing'
import type { Finding, FindingStatus, Review } from '../types'

import { applyOutcome, checkLine, roundSummaries, toCheck } from '../hooks/recheck'

const finding = (n: number, status: FindingStatus, round = 1): Finding => ({
  n,
  round,
  group: 'standards',
  weight: 'maybe',
  score: 5,
  file: 'a.ts',
  line: n,
  title: `F${n}`,
  now: '',
  suggested: '',
  why: '',
  draft: null,
  status,
})

const reviewOf = (mode: Review['mode'], findings: Finding[], rounds = 2): Review => ({
  pr: 'x',
  mode,
  rounds: Array.from({ length: rounds }, (_, i) => ({ n: i + 1, head: `h${i + 1}` })),
  findings,
  skipped: [],
})

test('on your PR, findings you fixed or are fixing are checked; open and won\'t fix are not', () => {
  const review = reviewOf('mine', [finding(1, 'fixing'), finding(2, 'fixed'), finding(3, 'open'), finding(4, 'wontfix')])

  expect(toCheck(review).map(f => f.n)).toEqual([1, 2])
})

test('on their PR, only posted findings are checked; pending, open and dropped are not', () => {
  const review = reviewOf('theirs', [finding(1, 'posted'), finding(2, 'pending'), finding(3, 'open'), finding(4, 'dropped')])

  expect(toCheck(review).map(f => f.n)).toEqual([1])
})

test('findings from the round in progress are new problems, not checked', () => {
  const review = reviewOf('mine', [finding(1, 'fixed', 1), finding(2, 'fixed', 2)])

  expect(toCheck(review).map(f => f.n)).toEqual([1])
})

test('an outcome is recorded with its note; a finding not acted on is refused', () => {
  const review = reviewOf('mine', [finding(1, 'fixed'), finding(2, 'wontfix')])

  const checked = applyOutcome(review, 1, 'wrong', 'The name is still a number')
  expect(typeof checked === 'string' ? checked : checked.findings[0]).toMatchObject({ outcome: 'wrong', outcomeNote: 'The name is still a number', outcomeRound: 2 })
  expect(applyOutcome(review, 2, 'addressed', '')).toMatch('#2')
  expect(applyOutcome(review, 9, 'addressed', '')).toMatch('#9')
})

test('each round sums up its findings, its outcomes and its new problems', () => {
  const review = reviewOf('mine', [
    { ...finding(1, 'fixed'), outcome: 'addressed', outcomeRound: 2 },
    { ...finding(2, 'fixed'), outcome: 'wrong', outcomeRound: 2 },
    { ...finding(3, 'fixing'), outcome: 'missed', outcomeRound: 2 },
    finding(4, 'open', 2),
  ])

  expect(roundSummaries(review)).toEqual([
    { n: 1, found: 3, addressed: 0, wrong: 0, missed: 0 },
    { n: 2, found: 1, addressed: 1, wrong: 1, missed: 1 },
  ])
})

test('a check line names the number, place and title', () => {
  expect(checkLine(finding(3, 'fixed'))).toBe('#3 a.ts:3 F3')
})
