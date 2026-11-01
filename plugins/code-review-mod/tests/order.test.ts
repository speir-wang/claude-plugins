import { expect, test } from 'claude-code/testing'
import type { Finding, Level } from '../types'

import { groupFindings, renumber } from '../hooks/order'

const finding = (n: number, group: Finding['group'], level: Level | null): Finding => ({
  n,
  round: 1,
  group,
  level,
  confidence: 'confirmed',
  file: 'a.ts',
  line: 1,
  title: `F${n}`,
  now: '',
  suggested: '',
  why: '',
  scenario: '',
  evidence: '',
  draft: null,
  status: 'open',
})

test('findings sort by level inside each group, and groups never mix', () => {
  const sections = groupFindings([finding(1, 'spec', 'medium'), finding(2, 'standards', 'low'), finding(3, 'standards', 'xhigh'), finding(4, 'spec', 'high')], [])

  expect(sections.map(s => s.group)).toEqual(['standards', 'spec'])
  expect(sections[0]!.rows.map(r => r.finding.n)).toEqual([3, 2])
  expect(sections[1]!.rows.map(r => r.finding.n)).toEqual([4, 1])
})

test('the same level keeps the order they came in', () => {
  const sections = groupFindings([finding(1, 'standards', 'medium'), finding(2, 'standards', 'medium')], [])

  expect(sections[0]!.rows.map(r => r.finding.n)).toEqual([1, 2])
})

test('"low" is greyed out but still listed', () => {
  const rows = groupFindings([finding(1, 'standards', 'low'), finding(2, 'standards', 'medium')], [])[0]!.rows

  expect(rows.map(r => [r.finding.n, r.isGrey])).toEqual([[2, false], [1, true]])
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
  const earlier = { ...finding(1, 'standards', 'medium'), round: 1 }
  const review = {
    pr: 'x',
    mode: 'mine' as const,
    rounds: [{ n: 1, head: 'h1' }, { n: 2, head: 'h2' }],
    skipped: [],
    findings: [earlier, { ...finding(2, 'spec', 'xhigh'), round: 2 }, { ...finding(3, 'standards', 'low'), round: 2 }, { ...finding(4, 'standards', 'high'), round: 2 }],
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
