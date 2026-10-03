import { expect, test } from 'claude-code/testing'
import type { Earlier, Todo } from '../types'

import { earlierSummary, fit, progressBar, rowLook, toolRowLine } from '../hooks/ui/rows'

const H1 = '1'.repeat(40)
const H2 = '2'.repeat(40)
const todo = (status: Todo['status'], commits: string[] = []): Todo => ({ id: 't', title: 'Do it', status, commits })

test('fit cuts with an ellipsis or pads to the exact width', () => {
  expect(fit('abcdef', 4)).toBe('abc…')
  expect(fit('ab', 4)).toBe('ab  ')
  expect(fit('abcd', 4)).toBe('abcd')
  expect(fit('abcd', 1)).toBe('')
})

test('a pending todo is a dim box with a dash and no way in', () => {
  expect(rowLook(todo('pending'), 1, '⠋', false, 6)).toEqual({
    icon: '☐',
    iconColor: undefined,
    key: undefined,
    label: '1: Do it  ',
    hotkey: undefined,
    tag: { text: '—', color: undefined },
    opens: null,
  })
})

test('a todo in progress without a commit shows the spinner and opens the uncommitted changes', () => {
  expect(rowLook(todo('in_progress'), 2, '⠙', false, 6)).toEqual({
    icon: '⠙',
    iconColor: 'yellow',
    key: 'w-t',
    label: 'Do it  —',
    hotkey: '2',
    tag: null,
    opens: { kind: 'working' },
  })
})

test('a todo in progress with a commit opens that commit', () => {
  const look = rowLook(todo('in_progress', [H1]), 1, '⠋', false, 6)
  expect(look.opens).toEqual({ kind: 'commit', hash: H1 })
  expect(look.key).toBe(`c-t-${H1}`)
  expect(look.label).toBe('Do it  1111111')
  expect(look.tag).toBe(null)
})

test('a done todo with a commit shows the check and the short hash of its latest commit', () => {
  const look = rowLook(todo('completed', [H1, H2]), 3, '⠋', false, 6)
  expect(look.icon).toBe('✔')
  expect(look.iconColor).toBe('green')
  expect(look.label).toBe('Do it  2222222')
  expect(look.hotkey).toBe('3')
  expect(look.opens).toEqual({ kind: 'commit', hash: H2 })
})

test('a done todo without a commit is flagged', () => {
  const look = rowLook(todo('completed'), 1, '⠋', false, 6)
  expect(look.icon).toBe('⚠')
  expect(look.iconColor).toBe('yellow')
  expect(look.tag).toEqual({ text: 'no commit', color: 'yellow' })
  expect(look.opens).toBe(null)
})

test('a commit that left the branch is tagged dropped but still opens', () => {
  const look = rowLook(todo('completed', [H1]), 1, '⠋', true, 6)
  expect(look.tag).toEqual({ text: 'dropped', color: 'red' })
  expect(look.label).toBe('Do it  ')
  expect(look.opens).toEqual({ kind: 'commit', hash: H1 })
})

test('from number 10 on there is no hotkey and the number goes in the label', () => {
  const look = rowLook(todo('completed', [H1]), 10, '⠋', false, 6)
  expect(look.hotkey).toBe(undefined)
  expect(look.label).toBe('10:Do it  1111111')
  expect(rowLook(todo('pending'), 12, '⠋', false, 6).label).toBe('12:Do it  ')
})

test('progressBar gives filled and empty cells, at most 10', () => {
  expect(progressBar([])).toEqual({ filled: 0, empty: 1, done: 0, total: 0 })
  expect(progressBar([todo('completed')])).toEqual({ filled: 1, empty: 0, done: 1, total: 1 })
  const twelve = Array.from({ length: 12 }, (_, i) => todo(i < 6 ? 'completed' : 'pending'))
  expect(progressBar(twelve)).toEqual({ filled: 5, empty: 5, done: 6, total: 12 })
})

test('earlierSummary hides commits that are linked to a todo and shrinks the count', () => {
  const earlier: Earlier = { base: 'main', total: 25, commits: [{ hash: H1, subject: 'a' }, { hash: H2, subject: 'b' }] }
  expect(earlierSummary(earlier, [todo('completed', [H1])])).toEqual({
    commits: [{ hash: H2, subject: 'b' }],
    total: 24,
    more: 23,
  })
  expect(earlierSummary(null, [])).toEqual({ commits: [], total: 0, more: 0 })
})

test('toolRowLine gives the icon, color and text of the one-line tool row', () => {
  const list = [{ id: 't', title: 'Add a comment', status: 'completed' as const, commits: [H1] }]
  expect(toolRowLine({ action: 'add', titles: ['One'] }, list)).toEqual({ icon: '☐', color: undefined, text: 'Added: One' })
  expect(toolRowLine({ action: 'add', titles: ['One', 'Two'] }, list).text).toBe('Added 2 todos: One…')
  expect(toolRowLine({ action: 'start', number: 1 }, list)).toEqual({ icon: '▸', color: 'yellow', text: 'Started 1: Add a comment' })
  expect(toolRowLine({ action: 'done', number: 1 }, list)).toEqual({ icon: '✔', color: 'green', text: 'Done 1: Add a comment · 1111111' })
  expect(toolRowLine({ action: 'clear' }, list)).toEqual({ icon: '⊘', color: undefined, text: 'Cleared the todos' })
})
