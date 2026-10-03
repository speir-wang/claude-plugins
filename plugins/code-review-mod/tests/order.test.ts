import { expect, test } from 'claude-code/testing'
import type { Finding } from '../types'

import { groupFindings } from '../hooks/order'

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
