import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { TodosInput } from '../types'

import { backToList, showCommit, showWorking, toggleFile } from './commit-view'
import { COMMIT_RULE, SPINNER, SPIN_MS, TODO_PANE, TOOL } from './config'
import { changeStatus, changeTodos } from './ports'
import type { Ports } from './ports'
import { afterBash, syncPlace } from './sync'
import { fromTodoWrite, renameTodo } from './todo-list'
import { COMMAND_SPEC, TOOL_SPEC, runCommand, runTool } from './todo-tool'
import { drawCommitPane } from './ui/commit-pane'
import { drawListPane } from './ui/list-pane'
import { toolRowLine } from './ui/rows'
import { drawEmptyResult, drawToolRow } from './ui/tool-row'

const todos = atom({ plugin: 'todo-commits', key: 'todos' } as const, [])
const head = atom({ plugin: 'todo-commits', key: 'head' } as const, '')
const lastActiveId = atom({ plugin: 'todo-commits', key: 'lastActiveId' } as const, '')
const commit = atom({ plugin: 'todo-commits', key: 'commit' } as const, null)
const place = atom({ plugin: 'todo-commits', key: 'place' } as const, null)
const earlier = atom({ plugin: 'todo-commits', key: 'earlier' } as const, null)
const isEarlierOpen = atom({ plugin: 'todo-commits', key: 'isEarlierOpen' } as const, false)
const frame = atom({ plugin: 'todo-commits', key: 'frame' } as const, 0)
const dropped = atom({ plugin: 'todo-commits', key: 'dropped' } as const, [])

type $ = EngineInterface

/** The engine's calls the other modules use, built for one event (see Ports). */
function ports($: $): Ports {
  return {
    run: argv => $.process.run(argv),
    storeGet: async key => $.store.get(key),
    storeSet: async (key, value) => $.store.set(key, value),
    now: async () => $.clock.now(),
    isPaneOpen: async () => (await $.ui.panes()).some(pane => pane.id === TODO_PANE),
    openPane: async args => {
      await $.ui.open({ id: TODO_PANE, ...args })
    },
    closePane: async () => {
      await $.ui.close({ id: TODO_PANE })
    },
    complete: request => $.model.complete(request),
    todos: { get: () => read($, todos), update: change => update($, todos, change) },
    head: { get: () => read($, head), update: change => update($, head, change) },
    lastActiveId: { get: () => read($, lastActiveId), update: change => update($, lastActiveId, change) },
    commit: { get: () => read($, commit), update: change => update($, commit, change) },
    place: { get: () => read($, place), update: change => update($, place, change) },
    earlier: { get: () => read($, earlier), update: change => update($, earlier, change) },
    dropped: { get: () => read($, dropped), update: change => update($, dropped, change) },
  }
}

/** Opens the todo pane the first time Claude makes a list. */
async function openIfNew(p: Pick<Ports, 'isPaneOpen' | 'openPane'>, hadTodos: boolean) {
  if (!hadTodos && !(await p.isPaneOpen())) {
    await p.openPane({ title: 'Todos' })
  }
}

export const register: Register = on => {
  let spinner: Timer | undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register(COMMAND_SPEC)
    await $.tool.register(TOOL_SPEC)
    await syncPlace(ports($))
    spinner?.cancel()
    spinner = $.clock.every(SPIN_MS, () => {
      void (async () => {
        if ((await read($, todos)).some(todo => todo.status === 'in_progress')) {
          await update($, frame, n => (n + 1) % SPINNER.length)
        }
      })()
    })

    return started
  })

  on('command.run', { command: 'todos' }, async ($, e) => {
    return { text: await runCommand(ports($), e.args) }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id !== TODO_PANE) {
      return next(e)
    }
    // Esc or the close mark on a commit goes back to the list instead of closing.
    if (e.origin.kind === 'person' && (await read($, commit)) !== null) {
      await backToList(ports($))
      return { value: undefined }
    }
    await update($, commit, () => null)

    return next(e)
  })

  // The loader reads hook filters from this file only: keep this name written out, not TOOL from config.
  on('tool.call', { tool: 'mcp__todo-commits__todos' }, async ($, e) => {
    const p = ports($)
    const answer = await runTool(p, e as TodosInput)
    // Claude is changing the list: show it, so its one-line rows never stand alone.
    if (!(await p.isPaneOpen())) {
      await p.openPane({ title: 'Todos' })
    }

    return answer.isError ? { result: answer.text, isError: true as const } : { result: answer.text }
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError) {
      return ran
    }
    const p = ports($)
    const hadTodos = (await p.todos.get()).length > 0
    const { id, subject } = ran.result.task
    await changeTodos(p, list => [...list, { id, title: subject, status: 'pending' as const, commits: [] }])
    await openIfNew(p, hadTodos)

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError) {
      return ran
    }
    const p = ports($)
    if (e.status !== undefined) {
      await changeStatus(p, e.taskId, e.status, e.subject)
    } else if (e.subject !== undefined) {
      const subject = e.subject
      await changeTodos(p, list => renameTodo(list, e.taskId, subject))
    }

    return ran
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError) {
      return ran
    }
    const p = ports($)
    const previous = await p.todos.get()
    const nextList = fromTodoWrite(previous, e.todos)
    await changeTodos(p, () => nextList)
    const active = nextList.find(todo => todo.status === 'in_progress')
    if (active !== undefined) {
      await p.lastActiveId.update(() => active.id)
    }
    await openIfNew(p, previous.length > 0)

    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await afterBash(ports($))

    return ran
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await ports($).isPaneOpen())) {
      return composed
    }

    return {
      sections: [
        ...composed.sections,
        { id: 'todo-commits:commit-rule', text: COMMIT_RULE, scope: 'session' },
      ],
    }
  })

  // Written out for the loader, like the tool name above: this is TODO_PANE.
  on('ui.render', { component: 'Pane', requestId: 'todo-commits' }, async ($, e) => {
    const parts = $.ui.resolve(e)
    const view = await read($, commit)
    if (view !== null) {
      return drawCommitPane(parts, view, {
        back: () => backToList(ports($)),
        toggle: (hash, path) => toggleFile(ports($), hash, path),
      })
    }
    const list = await read($, todos)
    const isWorking = list.some(todo => todo.status === 'in_progress')

    return drawListPane(
      parts,
      {
        list,
        here: await read($, place),
        before: await read($, earlier),
        spin: SPINNER[isWorking ? (await read($, frame)) % SPINNER.length : 0] ?? '',
        columns: e.props.bodyColumns ?? 60,
        isEarlierOpen: await read($, isEarlierOpen),
        gone: new Set(await read($, dropped)),
      },
      {
        showCommit: hash => showCommit(ports($), hash),
        showWorking: () => showWorking(ports($)),
        toggleEarlier: async () => {
          await update($, isEarlierOpen, value => !value)
        },
      },
    )
  })

  // The todo tool's calls draw as one line; the pane shows the list itself.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, input, isErrored, isInterrupted } = e.props
    if (tool !== TOOL || isErrored || isInterrupted) {
      return next(e)
    }

    return drawToolRow($.ui.resolve(e), toolRowLine((input ?? {}) as TodosInput, await read($, todos)))
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isErrored) {
      return next(e)
    }

    return drawEmptyResult($.ui.resolve(e))
  })
}
