import type { TodosInput } from '../types'

import { TOOL_NAME } from './config'
import { tidyTitle } from './model'
import { changeStatus, changeTodos } from './ports'
import type { Ports } from './ports'
import { linkNewCommits, beforeTodosOpen } from './sync'
import type { SyncPorts } from './sync'
import { addTodos, listText, progress, renameTodo } from './todo-list'

/** The /todos command, as it is registered. */
export const COMMAND_SPEC = {
  name: 'todos',
  description: 'Show or hide the todo panel; "/todos add <text>" adds a todo, "/todos clear" empties the list',
  argumentHint: '[add <text> | clear]',
}

/** The todos tool, as it is registered. */
export const TOOL_SPEC = {
  name: TOOL_NAME,
  description:
    "The user's todo panel. \"add\" appends steps as not started (titles). " +
    '"start" and "done" take a todo\'s number (1 is the first). "clear" empties the list. ' +
    'Answers with the numbered list.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['add', 'start', 'done', 'clear'] },
      titles: { type: 'array', items: { type: 'string' }, description: 'For "add": one short title per step.' },
      number: { type: 'integer', minimum: 1, description: 'For "start" and "done": the todo\'s number.' },
    },
    required: ['action'],
  },
}

type TodosAnswer = { text: string; isError?: true }

/** What running the tool needs. */
type ToolPorts = SyncPorts & Pick<Ports, 'now'>

/** What running the command needs. */
type CommandPorts = ToolPorts & Pick<Ports, 'isPaneOpen' | 'openPane' | 'closePane' | 'complete'>

/**
 * Serves the mod's own todo tool. "add" answers with the whole numbered list,
 * so the model learns the numbers; the rest answer in one line.
 */
export async function runTool(p: ToolPorts, input: TodosInput): Promise<TodosAnswer> {
  const list = await p.todos.get()
  const position = typeof input.number === 'number' ? input.number : NaN
  const picked = list[position - 1]

  if (input.action === 'add') {
    const titles = Array.isArray(input.titles)
      ? input.titles.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : []
    if (titles.length === 0) {
      return { text: 'Nothing added: "titles" needs at least one title.', isError: true }
    }
    const stamp = await p.now()
    await changeTodos(p, current => addTodos(current, titles, stamp))

    return { text: listText(await p.todos.get()) }
  }
  if (input.action === 'start' || input.action === 'done') {
    if (picked === undefined) {
      return { text: `No todo number ${String(input.number)}. There are ${list.length}.`, isError: true }
    }
    if (input.action === 'done') {
      // A commit made just before "done" still belongs to this todo.
      await linkNewCommits(p)
    }
    await changeStatus(p, picked.id, input.action === 'start' ? 'in_progress' : 'completed')
    await p.lastActiveId.update(() => picked.id)
    const now = await p.todos.get()
    const { done } = progress(now)

    return input.action === 'start'
      ? { text: `Started ${position}: ${picked.title}` }
      : { text: `Done ${position}: ${picked.title} (${done} of ${now.length} done)` }
  }
  if (input.action === 'clear') {
    await changeTodos(p, () => [])
    await p.lastActiveId.update(() => '')

    return { text: 'The todo list is empty.' }
  }

  return { text: 'Unknown action. Use "add", "start", "done" or "clear".', isError: true }
}

/** Runs "/todos [add <text> | clear]" and answers with the reply text. */
export async function runCommand(p: CommandPorts, args: string): Promise<string> {
  // Plain "/todos" toggles; "add" and "clear" always leave the pane open.
  if (args.trim() === '' && (await p.isPaneOpen())) {
    await p.closePane()
    return 'Todo panel closed. Claude no longer commits after each todo.'
  }
  await beforeTodosOpen(p)
  await p.openPane({ title: 'Todos' })

  if (/^clear$/i.test(args.trim())) {
    const count = (await p.todos.get()).length
    await runTool(p, { action: 'clear' })
    return `Cleared ${count} ${count === 1 ? 'todo' : 'todos'}. The list is empty now; old todo numbers no longer apply.`
  }

  const adding = args.trim().match(/^add(?:\s+([\s\S]*))?$/i)
  if (adding === null) {
    return 'Todo panel opened. Claude will commit after each todo while it is open.'
  }
  const title = adding[1]?.trim() ?? ''
  if (title === '') {
    return 'Nothing added. Write the todo after "add", like: /todos add Bump the theme version'
  }
  await runTool(p, { action: 'add', titles: [title] })
  const added = (await p.todos.get()).at(-1)
  const count = (await p.todos.get()).length
  // The row shows the typed words at once; the tidy title replaces them when it comes.
  const tidy = await tidyTitle(p, title)
  if (added !== undefined && tidy !== undefined) {
    await changeTodos(p, list => renameTodo(list, added.id, tidy))
  }

  return `Added todo ${count}: ${tidy ?? title}`
}
