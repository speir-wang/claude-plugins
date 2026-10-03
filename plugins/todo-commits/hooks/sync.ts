import type { Todo } from '../types'

import { missingCommits, newCommits, readEarlier, readHead, readPlace } from './git'
import { changeTodos } from './state'
import type { Ports } from './state'
import { linkCommits, pickTarget } from './todo-list'

/** Refreshes the earlier section and the dropped commits: the one step run when git moved. */
export async function refreshBranchInfo(p: Ports) {
  const here = await p.place.get()
  const found = await readEarlier(p, here?.branch)
  await p.earlier.update(() => found)
  const hashes = (await p.todos.get()).flatMap(todo => todo.commits)
  const gone = await missingCommits(p, hashes)
  await p.dropped.update(() => gone)
}

/**
 * Follows the repo and branch: on a change, loads that branch's saved list
 * and refreshes the branch info. Answers true when the place changed, so
 * HEAD's move is not read as new commits.
 */
export async function syncPlace(p: Ports): Promise<boolean> {
  const now = await readPlace(p)
  const was = await p.place.get()
  if (now?.key === was?.key) {
    return false
  }
  const saved = now === null ? undefined : await p.storeGet(`todos:${now.key}`)
  await p.place.update(() => now)
  if (was === null && !Array.isArray(saved)) {
    // First look in this session with nothing saved yet: keep the list in hand.
    await changeTodos(p, list => list)
  } else {
    await p.todos.update(() => (Array.isArray(saved) ? (saved as Todo[]) : []))
  }
  await p.lastActiveId.update(() => '')
  const at = await readHead(p)
  await p.head.update(() => at)
  await refreshBranchInfo(p)

  return true
}

/** Gives every commit made since the last look to the active todo; true when HEAD moved. */
export async function linkNewCommits(p: Ports): Promise<boolean> {
  const before = await p.head.get()
  const after = await readHead(p)
  if (after === '' || after === before) {
    return false
  }
  await p.head.update(() => after)

  const hashes = await newCommits(p, before, after)
  const target = pickTarget(await p.todos.get(), await p.lastActiveId.get())
  if (target === '' || hashes.length === 0) {
    return true
  }
  await changeTodos(p, current => linkCommits(current, target, hashes))

  return true
}

/** After a Bash call: follow the branch, link new commits, and refresh when HEAD moved. */
export async function afterBash(p: Ports) {
  if (!(await syncPlace(p)) && (await linkNewCommits(p))) {
    await refreshBranchInfo(p)
  }
}

/** Before /todos opens: follow the branch, and refresh unless following already did. */
export async function beforeTodosOpen(p: Ports) {
  if (!(await syncPlace(p))) {
    await refreshBranchInfo(p)
  }
}
