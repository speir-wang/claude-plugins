import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'

import type { CommitView, Earlier, Place, Todo, TodoStatus } from '../types'

import { setStatus } from './todo-list'

/** One value the plugin keeps in `$.state`, read and changed through two small calls. */
export type Cell<T> = {
  get: () => Promise<T>
  /** Changes the value and answers the new one. */
  update: (change: (value: T) => T) => Promise<T>
}

/**
 * The engine's calls the other modules may use, as plain calls.
 * The engine only follows `$` inside the entry file, so the entry file builds
 * this and hands it on. Each module asks only for the members it uses.
 */
export type Ports = {
  run: (argv: string[]) => Promise<{ exitCode: number; stdout: string }>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  now: () => Promise<number>
  isPaneOpen: () => Promise<boolean>
  openPane: (args: { title: string; closeOnEscape?: true }) => Promise<void>
  closePane: () => Promise<void>
  complete: (request: ModelCompleteRequest) => Promise<ModelCompleteResult>
  todos: Cell<Todo[]>
  head: Cell<string>
  lastActiveId: Cell<string>
  commit: Cell<CommitView | null>
  place: Cell<Place | null>
  earlier: Cell<Earlier | null>
  dropped: Cell<string[]>
}

/** What saving the list needs. */
export type SavePorts = Pick<Ports, 'todos' | 'place' | 'storeSet'>

/** Changes the list and saves it for this repo and branch. */
export async function changeTodos(p: SavePorts, change: (list: Todo[]) => Todo[]) {
  const list = await p.todos.update(change)
  const here = await p.place.get()
  if (here !== null) {
    await p.storeSet(`todos:${here.key}`, list)
  }
}

/** Sets a todo's status (and title) and saves; the one that starts becomes the last active one. */
export async function changeStatus(
  p: SavePorts & Pick<Ports, 'lastActiveId'>,
  id: string,
  status: TodoStatus | 'deleted',
  title?: string,
) {
  await changeTodos(p, list => setStatus(list, id, status, title))
  if (status === 'in_progress') {
    await p.lastActiveId.update(() => id)
  }
}
