import { expect, test } from 'claude-code/testing'
import type { Finding } from '../types'

import { groupFindings, renumber } from '../hooks/order'

const finding = (n: number, group: Finding['group'], score: number): Finding => ({
  n,
  round: 1,
  group,
  weight: 'maybe',
  score,
  file: 'a.ts',
  line: 1,
  title: `F${n}`,
  now: '',
  suggested: '',
  why: '',
  draft: null,
  status: 'open',
})

test('findings sort by score inside each group, and groups never mix', () => {
  const sections = groupFindings([finding(1, 'spec', 3), finding(2, 'standards', 2), finding(3, 'standards', 9), finding(4, 'spec', 10)], [])

  expect(sections.map(s => s.group)).toEqual(['standards', 'spec'])
  expect(sections[0]!.rows.map(r => r.finding.n)).toEqual([3, 2])
  expect(sections[1]!.rows.map(r => r.finding.n)).toEqual([4, 1])
})

test('same scores keep the order they came in', () => {
  const sections = groupFindings([finding(1, 'standards', 5), finding(2, 'standards', 5)], [])

  expect(sections[0]!.rows.map(r => r.finding.n)).toEqual([1, 2])
})

test('scores 1 and 2 are greyed out but still listed', () => {
  const rows = groupFindings([finding(1, 'standards', 1), finding(2, 'standards', 2), finding(3, 'standards', 3)], [])[0]!.rows

  expect(rows.map(r => [r.finding.n, r.isGrey])).toEqual([[3, false], [2, true], [1, true]])
})

test('an empty group says nothing found; a skipped one says why', () => {
  const sections = groupFindings([], [{ group: 'spec', reason: 'no spec found' }])

  expect(sections.map(s => [s.label, s.note])).toEqual([
    ['Standards', 'nothing found'],
    ['Spec', 'skipped, no spec found'],
  ])
})

test('findings rebuilt from your comments get their own section, in the order posted', () => {
  const sections = groupFindings([finding(1, 'comment', 0), finding(2, 'comment', 0)], [])

  expect(sections.map(s => s.label)).toEqual(['Standards', 'Spec', 'Your comments'])
  expect(sections[2]!.rows.map(r => [r.finding.n, r.isGrey])).toEqual([[1, false], [2, false]])
})

test('when a round ends its findings are numbered top to bottom, Standards then Spec, after earlier rounds', () => {
  const earlier = { ...finding(1, 'standards', 3), round: 1 }
  const review = {
    pr: 'x',
    mode: 'mine' as const,
    rounds: [{ n: 1, head: 'h1' }, { n: 2, head: 'h2' }],
    skipped: [],
    findings: [earlier, { ...finding(2, 'spec', 9), round: 2 }, { ...finding(3, 'standards', 2), round: 2 }, { ...finding(4, 'standards', 8), round: 2 }],
  }

  const { review: numbered, moved } = renumber(review)

  expect(numbered.findings.map(f => [f.title, f.n])).toEqual([
    ['F1', 1],
    ['F2', 4],
    ['F3', 3],
    ['F4', 2],
  ])
  expect(moved.get(4)).toBe(2)
})
