import type { Todo, TodoStatus } from '../types'

/** One item of Claude's own TodoWrite tool. */
export type WrittenItem = { content: string; status: TodoStatus }

/** Adds pending todos at the end. Blank titles are skipped; ids are `m<stamp>-<index>`. */
export function addTodos(list: Todo[], titles: string[], stamp: number): Todo[] {
  const added: Todo[] = titles
    .filter(title => title.trim() !== '')
    .map((title, i) => ({ id: `m${stamp}-${i}`, title: title.trim(), status: 'pending' as const, commits: [] }))

  return [...list, ...added]
}

/** Sets a todo's status (and its title, if given); "deleted" removes it. */
export function setStatus(list: Todo[], id: string, status: TodoStatus | 'deleted', title?: string): Todo[] {
  return status === 'deleted'
    ? list.filter(todo => todo.id !== id)
    : list.map(todo => (todo.id === id ? { ...todo, status, title: title ?? todo.title } : todo))
}

/** Changes only a todo's title. */
export function renameTodo(list: Todo[], id: string, title: string): Todo[] {
  return list.map(todo => (todo.id === id ? { ...todo, title } : todo))
}

/** Gives a todo the commits it does not have yet, keeping their order. */
export function linkCommits(list: Todo[], id: string, hashes: string[]): Todo[] {
  return list.map(todo =>
    todo.id === id ? { ...todo, commits: [...todo.commits, ...hashes.filter(h => !todo.commits.includes(h))] } : todo,
  )
}

/** The todo a new commit belongs to: the one in progress, else the last active one, else none. */
export function pickTarget(list: Todo[], lastActiveId: string): string {
  return list.find(todo => todo.status === 'in_progress')?.id ?? lastActiveId
}

/** Builds the list from a TodoWrite call, keeping the commits of items whose content matches. */
export function fromTodoWrite(previous: Todo[], items: WrittenItem[]): Todo[] {
  return items.map(item => ({
    id: item.content,
    title: item.content,
    status: item.status,
    commits: previous.find(todo => todo.id === item.content)?.commits ?? [],
  }))
}

/** The numbered list, as the model reads it. */
export function listText(list: Todo[]): string {
  return list.length === 0
    ? 'The todo list is empty.'
    : list.map((todo, i) => `${i + 1}. [${todo.status}] ${todo.title}`).join('\n')
}

/** How many todos are done, out of how many. */
export function progress(list: Todo[]): { done: number; total: number } {
  return { done: list.filter(todo => todo.status === 'completed').length, total: list.length }
}
