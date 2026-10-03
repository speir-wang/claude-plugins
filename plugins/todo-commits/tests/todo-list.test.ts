import { expect, test } from 'claude-code/testing'
import type { Todo } from '../types'

import { addTodos, fromTodoWrite, linkCommits, listText, pickTarget, progress, renameTodo, setStatus } from '../hooks/todo-list'

const todo = (id: string, status: Todo['status'] = 'pending', commits: string[] = []): Todo => ({ id, title: `Title ${id}`, status, commits })

test('progress counts the done todos', () => {
  expect(progress([])).toEqual({ done: 0, total: 0 })
  expect(progress([todo('a', 'completed'), todo('b'), todo('c', 'in_progress')])).toEqual({ done: 1, total: 3 })
})

test('addTodos appends trimmed pending todos with stamped ids and skips blank titles', () => {
  const list = [todo('a')]
  expect(addTodos(list, ['  First ', '', '   ', 'Second'], 1000)).toEqual([
    todo('a'),
    { id: 'm1000-0', title: 'First', status: 'pending', commits: [] },
    { id: 'm1000-1', title: 'Second', status: 'pending', commits: [] },
  ])
  expect(list).toEqual([todo('a')])
})

test('setStatus sets the status and optional title, and deleted removes the todo', () => {
  const list = [todo('a'), todo('b')]
  expect(setStatus(list, 'a', 'in_progress').map(t => t.status)).toEqual(['in_progress', 'pending'])
  expect(setStatus(list, 'a', 'completed', 'Renamed')[0]?.title).toBe('Renamed')
  expect(setStatus(list, 'a', 'completed')[0]?.title).toBe('Title a')
  expect(setStatus(list, 'a', 'deleted').map(t => t.id)).toEqual(['b'])
  expect(setStatus(list, 'zzz', 'completed')).toEqual(list)
  expect(setStatus([], 'a', 'deleted')).toEqual([])
})

test('renameTodo changes only the title', () => {
  const list = [todo('a', 'in_progress', ['x'])]
  expect(renameTodo(list, 'a', 'New')).toEqual([{ id: 'a', title: 'New', status: 'in_progress', commits: ['x'] }])
  expect(renameTodo(list, 'nope', 'New')).toEqual(list)
})

test('linkCommits adds new hashes in order and skips ones the todo has', () => {
  const list = [todo('a', 'pending', ['h1']), todo('b')]
  expect(linkCommits(list, 'a', ['h1', 'h2', 'h3'])[0]?.commits).toEqual(['h1', 'h2', 'h3'])
  expect(linkCommits(list, 'a', ['h1', 'h2'])[0]?.commits).toEqual(['h1', 'h2'])
  expect(linkCommits(list, 'b', ['h1'])[1]?.commits).toEqual(['h1'])
  expect(linkCommits(list, 'nope', ['h9'])).toEqual(list)
})

test('pickTarget prefers the in-progress todo, then the last active one, then nothing', () => {
  expect(pickTarget([todo('a'), todo('b', 'in_progress')], 'a')).toBe('b')
  expect(pickTarget([todo('a', 'completed')], 'a')).toBe('a')
  expect(pickTarget([], '')).toBe('')
})

test('fromTodoWrite builds the list and keeps commits for items with the same content', () => {
  const previous = [{ id: 'Change x', title: 'Change x', status: 'in_progress' as const, commits: ['h1'] }]
  const items = [
    { content: 'Change x', status: 'completed' as const },
    { content: 'Change y', status: 'pending' as const },
  ]
  expect(fromTodoWrite(previous, items)).toEqual([
    { id: 'Change x', title: 'Change x', status: 'completed', commits: ['h1'] },
    { id: 'Change y', title: 'Change y', status: 'pending', commits: [] },
  ])
  expect(fromTodoWrite([], [])).toEqual([])
})

test('listText numbers the todos, or says the list is empty', () => {
  expect(listText([])).toBe('The todo list is empty.')
  expect(listText([todo('a'), todo('b', 'completed')])).toBe('1. [pending] Title a\n2. [completed] Title b')
})
