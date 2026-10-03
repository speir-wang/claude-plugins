import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CommitFile, CommitView, DiffPiece, DiffVerdict, Earlier, Place, Todo, TodoStatus } from '../types'

import { COMMIT_RULE, SPINNER, SPIN_MS, TIPS, TODO_PANE, TOOL, TOOL_NAME } from './config'
import { splitDiff } from './diff'
import { missingCommits, newCommits, readCommit, readEarlier, readHead, readPlace, readWorking } from './git'
import { changeTodos } from './state'
import type { Ports } from './state'
import { cleanTitle, readVerdicts } from './model'
import { earlierSummary, fit, progressBar, rowLook, toolRowLine } from './ui/rows'
import type { ToolInput } from './ui/rows'
import { addTodos, fromTodoWrite, linkCommits, listText, pickTarget, progress, renameTodo, setStatus as withStatus } from './todo-list'

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
    isEarlierOpen: { get: () => read($, isEarlierOpen), update: change => update($, isEarlierOpen, change) },
    frame: { get: () => read($, frame), update: change => update($, frame, change) },
    dropped: { get: () => read($, dropped), update: change => update($, dropped, change) },
  }
}

async function isPaneOpen($: $): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === TODO_PANE)
}

/**
 * Follows the repo and branch: on a change, loads that branch's saved list.
 * Answers true when the place changed, so HEAD's move is not read as new commits.
 */
async function syncPlace($: $): Promise<boolean> {
  const now = await readPlace(ports($))
  const was = await read($, place)
  if (now?.key === was?.key) {
    return false
  }
  const saved = now === null ? undefined : await $.store.get(`todos:${now.key}`)
  await update($, place, () => now)
  if (was === null && !Array.isArray(saved)) {
    // First look in this session with nothing saved yet: keep the list in hand.
    await changeTodos(ports($), list => list)
  } else {
    await update($, todos, () => (Array.isArray(saved) ? (saved as Todo[]) : []))
  }
  await update($, lastActiveId, () => '')
  const at = await readHead(ports($))
  await update($, head, () => at)
  await refreshEarlier($)
  await refreshDropped($)

  return true
}

/** Opens (or retitles) the todo pane. */
async function openPane($: $, args: { title: string; closeOnEscape?: true }) {
  await $.ui.open({ id: TODO_PANE, ...args })
}

/** Reads the earlier section for this branch. */
async function refreshEarlier($: $) {
  const here = await read($, place)
  const found = await readEarlier(ports($), here?.branch)
  await update($, earlier, () => found)
}

/** Notes which linked commits are no longer on the branch. */
async function refreshDropped($: $) {
  const hashes = (await read($, todos)).flatMap(todo => todo.commits)
  const gone = await missingCommits(ports($), hashes)
  await update($, dropped, () => gone)
}

/** Opens the todo pane the first time Claude makes a list. */
async function openIfNew($: $, hadTodos: boolean) {
  if (!hadTodos && !(await isPaneOpen($))) {
    await openPane($, { title: 'Todos' })
  }
}

async function setStatus($: $, id: string, status: TodoStatus | 'deleted', title?: string) {
  await changeTodos(ports($), list => withStatus(list, id, status, title))
  if (status === 'in_progress') {
    await update($, lastActiveId, () => id)
  }
}

/** Gives every commit made since the last look to the active todo; true when HEAD moved. */
async function linkNewCommits($: $): Promise<boolean> {
  const before = await read($, head)
  const after = await readHead(ports($))
  if (after === '' || after === before) {
    return false
  }
  await update($, head, () => after)

  const hashes = await newCommits(ports($), before, after)
  const list = await read($, todos)
  const target = pickTarget(list, await read($, lastActiveId))
  if (target === '' || hashes.length === 0) {
    return true
  }

  await changeTodos(ports($), current => linkCommits(current, target, hashes))

  return true
}

/** Asks a small model whether each large file's diff is worth reading. */
async function judgeLargeFiles($: $, message: string, files: CommitFile[]): Promise<Map<string, DiffVerdict>> {
  const large = files.filter(file => file.isLarge)
  const samples = large.map(file => {
    const sample = file.pieces.map(piece => piece.text).join('\n').split('\n').slice(0, 40).join('\n')
    return `FILE ${file.path} (+${file.added} -${file.removed})\n${sample.slice(0, 3000)}`
  })
  const asked = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 800,
    timeoutMs: 30000,
    system:
      'You help a developer review a git commit. For each large file diff, say whether it is worth reading by eye. ' +
      'Generated or bulk changes (snapshot tests, lock files, minified or built files, fixtures, data dumps, ' +
      'mass renames or formatting) are usually not. Hand-written logic usually is.',
    prompt: [
      `Commit message: ${message}`,
      '',
      ...samples,
      '',
      'Answer with JSON only: [{"path": "...", "isWorth": true|false, "reason": "one short plain sentence"}]',
    ].join('\n'),
  })

  return asked.isAnswered ? readVerdicts(asked.text) : new Map<string, DiffVerdict>()
}

/** Shows a diff in the pane, folding large files and asking the model about them. */
async function presentView($: $, view: CommitView, title: string) {
  await update($, commit, () => view)
  // Same pane as the list: Esc (or the pane's close mark) goes back, see the ui.close hook.
  await openPane($, { title, closeOnEscape: true })

  if (view.isChecking) {
    const verdicts = await judgeLargeFiles($, view.message, view.files)
    await update($, commit, current =>
      current?.hash !== view.hash
        ? current
        : {
            ...current,
            isChecking: false,
            files: current.files.map(file => {
              const verdict = verdicts.get(file.path)
              return verdict === undefined ? file : { ...file, verdict }
            }),
          },
    )
  }
}

async function showCommit($: $, hash: string) {
  const { message, diff } = await readCommit(ports($), hash)
  const files = message === undefined || diff === undefined ? [] : splitDiff(diff)
  const view: CommitView = {
    hash,
    kind: 'commit',
    message: message ?? 'This commit could not be read here. It may have been dropped and cleaned up by git.',
    files,
    isChecking: files.some(file => file.isLarge),
  }
  await presentView($, view, `Commit ${hash.slice(0, 7)}`)
}

/** Shows what is changed but not committed: tracked changes, then new files. */
async function showWorking($: $) {
  const { diff, extra } = await readWorking(ports($))
  const files = splitDiff(diff)
  const view: CommitView = {
    hash: 'working',
    kind: 'working',
    message:
      'Not committed yet: the changes for the todo in progress.' +
      (extra > 0 ? ` ${extra} more new files not shown.` : ''),
    files,
    isChecking: files.some(file => file.isLarge),
  }
  await presentView($, view, 'Uncommitted')
}

async function backToList($: $) {
  await update($, commit, () => null)
  await openPane($, { title: 'Todos' })
}

/** Turns what the person typed into a short todo title; undefined when the model gives nothing usable. */
async function tidyTitle($: $, typed: string): Promise<string | undefined> {
  const asked = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 60,
    timeoutMs: 8000,
    system:
      'Rewrite what the user typed as one short todo title. Start with a verb. At most 50 characters. ' +
      'Keep any names, file names and numbers they wrote. Reply with the title only.',
    prompt: typed,
  })
  if (!asked.isAnswered) {
    return undefined
  }

  return cleanTitle(asked.text)
}

async function toggleFile($: $, hash: string, path: string) {
  await update($, commit, current =>
    current?.hash !== hash
      ? current
      : {
          ...current,
          files: current.files.map(file => (file.path === path ? { ...file, isOpen: !file.isOpen } : file)),
        },
  )
}

type TodosInput = ToolInput

type TodosAnswer = { text: string; isError?: true }

/**
 * Serves the mod's own todo tool. "add" answers with the whole numbered list,
 * so the model learns the numbers; the rest answer in one line.
 */
async function runTodosTool($: $, input: TodosInput): Promise<TodosAnswer> {
  const list = await read($, todos)
  const position = typeof input.number === 'number' ? input.number : NaN
  const picked = list[position - 1]

  if (input.action === 'add') {
    const titles = Array.isArray(input.titles)
      ? input.titles.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : []
    if (titles.length === 0) {
      return { text: 'Nothing added: "titles" needs at least one title.', isError: true }
    }
    const stamp = await $.clock.now()
    await changeTodos(ports($), current => addTodos(current, titles, stamp))

    return { text: listText(await read($, todos)) }
  }
  if (input.action === 'start' || input.action === 'done') {
    if (picked === undefined) {
      return { text: `No todo number ${String(input.number)}. There are ${list.length}.`, isError: true }
    }
    if (input.action === 'done') {
      // A commit made just before "done" still belongs to this todo.
      await linkNewCommits($)
    }
    await setStatus($, picked.id, input.action === 'start' ? 'in_progress' : 'completed')
    await update($, lastActiveId, () => picked.id)
    const now = await read($, todos)
    const { done } = progress(now)

    return input.action === 'start'
      ? { text: `Started ${position}: ${picked.title}` }
      : { text: `Done ${position}: ${picked.title} (${done} of ${now.length} done)` }
  }
  if (input.action === 'clear') {
    await changeTodos(ports($), () => [])
    await update($, lastActiveId, () => '')

    return { text: 'The todo list is empty.' }
  }

  return { text: 'Unknown action. Use "add", "start", "done" or "clear".', isError: true }
}

export const register: Register = on => {
  let spinner: Timer | undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'todos',
      description: 'Show or hide the todo panel; "/todos add <text>" adds a todo, "/todos clear" empties the list',
      argumentHint: '[add <text> | clear]',
    })
    await $.tool.register({
      name: TOOL_NAME,
      description:
        "The user's todo panel. \"add\" appends steps as not started (titles). " +
        '"start" and "done" take a todo\'s number (1 is the first). "clear" empties the list. ' +
        'Answers with the numbered list.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'start', 'done', 'clear'] },
          titles: { type: 'array', items: { type: 'string' }, description: 'For "add": one short title per step.' },
          number: { type: 'integer', minimum: 1, description: 'For "start" and "done": the todo\'s number.' },
        },
        required: ['action'],
      },
    })
    await syncPlace($)
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
    // Plain "/todos" toggles; "add" and "clear" always leave the pane open.
    if (e.args.trim() === '' && (await isPaneOpen($))) {
      await $.ui.close({ id: TODO_PANE })
      return { text: 'Todo panel closed. Claude no longer commits after each todo.' }
    }
    await syncPlace($)
    await refreshEarlier($)
    await refreshDropped($)
    await openPane($, { title: 'Todos' })

    if (/^clear$/i.test(e.args.trim())) {
      const count = (await read($, todos)).length
      await runTodosTool($, { action: 'clear' })
      return { text: `Cleared ${count} ${count === 1 ? 'todo' : 'todos'}. The list is empty now; old todo numbers no longer apply.` }
    }

    const adding = e.args.trim().match(/^add(?:\s+([\s\S]*))?$/i)
    if (adding === null) {
      return { text: 'Todo panel opened. Claude will commit after each todo while it is open.' }
    }
    const title = adding[1]?.trim() ?? ''
    if (title === '') {
      return { text: 'Nothing added. Write the todo after "add", like: /todos add Bump the theme version' }
    }
    await runTodosTool($, { action: 'add', titles: [title] })
    const added = (await read($, todos)).at(-1)
    const count = (await read($, todos)).length
    // The row shows the typed words at once; the tidy title replaces them when it comes.
    const tidy = await tidyTitle($, title)
    if (added !== undefined && tidy !== undefined) {
      await changeTodos(ports($), list => renameTodo(list, added.id, tidy))
    }

    return { text: `Added todo ${count}: ${tidy ?? title}` }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id !== TODO_PANE) {
      return next(e)
    }
    // Esc or the close mark on a commit goes back to the list instead of closing.
    if (e.origin.kind === 'person' && (await read($, commit)) !== null) {
      await backToList($)
      return { value: undefined }
    }
    await update($, commit, () => null)

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const answer = await runTodosTool($, e as TodosInput)
    // Claude is changing the list: show it, so its one-line rows never stand alone.
    if (!(await isPaneOpen($))) {
      await openPane($, { title: 'Todos' })
    }

    return answer.isError ? { result: answer.text, isError: true as const } : { result: answer.text }
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError) {
      return ran
    }
    const hadTodos = (await read($, todos)).length > 0
    const { id, subject } = ran.result.task
    await changeTodos(ports($), list => [...list, { id, title: subject, status: 'pending' as const, commits: [] }])
    await openIfNew($, hadTodos)

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError) {
      return ran
    }
    if (e.status !== undefined) {
      await setStatus($, e.taskId, e.status, e.subject)
    } else if (e.subject !== undefined) {
      const subject = e.subject
      await changeTodos(ports($), list => renameTodo(list, e.taskId, subject))
    }

    return ran
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError) {
      return ran
    }
    const previous = await read($, todos)
    const nextList = fromTodoWrite(previous, e.todos)
    await changeTodos(ports($), () => nextList)
    const active = nextList.find(todo => todo.status === 'in_progress')
    if (active !== undefined) {
      await update($, lastActiveId, () => active.id)
    }
    await openIfNew($, previous.length > 0)

    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const isMoved = !(await syncPlace($)) && (await linkNewCommits($))
    if (isMoved) {
      await refreshEarlier($)
      await refreshDropped($)
    }

    return ran
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await isPaneOpen($))) {
      return composed
    }

    return {
      sections: [
        ...composed.sections,
        { id: 'todo-commits:commit-rule', text: COMMIT_RULE, scope: 'session' },
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: TODO_PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const view = await read($, commit)
    if (view !== null) {
      const added = view.files.reduce((sum, file) => sum + file.added, 0)
      const removed = view.files.reduce((sum, file) => sum + file.removed, 0)

      const drawPiece = (file: CommitFile, piece: DiffPiece, i: number) =>
        piece.kind === 'diff' ? (
          <Code key={`d-${file.path}-${i}`} source={piece.text} path={file.path} format="diff" />
        ) : (
          <Box key={`p-${file.path}-${i}`} flexDirection="column">
            {piece.text.split('\n').map((line, j) => (
              <Text
                key={`l-${file.path}-${i}-${j}`}
                wrap="truncate-end"
                color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : undefined}
                dimColor={line.startsWith('@@')}
              >
                {line === '' ? ' ' : line}
              </Text>
            ))}
          </Box>
        )

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box key="summary">
              <Text bold color="yellow">
                {view.kind === 'working' ? 'Uncommitted' : view.hash.slice(0, 7)}
              </Text>
              <Text dimColor>
                {' '}· {view.files.length} {view.files.length === 1 ? 'file' : 'files'} ·{' '}
              </Text>
              <Text color="green">+{added}</Text>
              <Text> </Text>
              <Text color="red">−{removed}</Text>
            </Box>
            <Button key="back" label="← Back to todos" onPress={() => backToList($)} />
          </Box>
          <Box marginY={1}>
            <Text>{view.message}</Text>
          </Box>
          {view.files.map(file => (
            <Box key={`f-${file.path}`} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row">
                <Text bold>{file.path}</Text>
                <Text color="green"> +{file.added}</Text>
                <Text color="red"> −{file.removed}</Text>
              </Box>
              {file.isLarge && (
                <Box flexDirection="column">
                  {file.verdict !== undefined ? (
                    <Text color={file.verdict.isWorth ? 'cyan' : 'yellow'}>
                      {file.verdict.isWorth ? 'Worth a look: ' : 'Probably skip: '}
                      {file.verdict.reason}
                    </Text>
                  ) : (
                    <Text dimColor>
                      Large diff ({file.added + file.removed} lines changed).
                      {view.isChecking ? ' Checking whether it is worth reading…' : ''}
                    </Text>
                  )}
                  <Button
                    key={`t-${file.path}`}
                    label={file.isOpen ? 'Hide diff' : 'Show diff'}
                    onPress={() => toggleFile($, view.hash, file.path)}
                  />
                </Box>
              )}
              {file.isOpen && file.pieces.length === 0 && (
                <Text dimColor>(no text changes: binary, renamed or mode change)</Text>
              )}
              {file.isOpen && file.pieces.map((piece, i) => drawPiece(file, piece, i))}
              {file.isOpen && file.cutLines > 0 && (
                <Text dimColor>
                  {file.cutLines} more lines not shown. Run:{' '}
                  {view.kind === 'working' ? 'git diff HEAD' : `git show ${view.hash.slice(0, 7)}`} -- {file.path}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )
    }
    const list = await read($, todos)
    const here = await read($, place)
    const before = await read($, earlier)
    const isWorking = list.some(todo => todo.status === 'in_progress')
    const spin = SPINNER[isWorking ? (await read($, frame)) % SPINNER.length : 0]

    const columns = e.props.bodyColumns ?? 60
    // icon + space, "12: ", title, space, a 9-wide hash or tag slot
    const titleWidth = Math.max(8, columns - 2 - 4 - 1 - 9 - 1)
    const { filled, empty, done, total } = progressBar(list)
    const { commits: earlierCommits, total: earlierTotal, more } = earlierSummary(before, list)
    const isOpen = await read($, isEarlierOpen)
    const gone = new Set(await read($, dropped))

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" marginBottom={1}>
          {here !== null && <Text color="cyan">🌿 {here.branch}  </Text>}
          {list.length > 0 && (
            <Box flexDirection="row">
              <Text color="green">{'▰'.repeat(filled)}</Text>
              <Text dimColor>{'▱'.repeat(empty)}</Text>
              <Text bold> {done}/{total}</Text>
            </Box>
          )}
        </Box>

        {list.length === 0 && (
          <Box flexDirection="column">
            <Text dimColor>No todos yet. Try:</Text>
            {TIPS.map(([say, does]) => (
              <Box key={`tip-${say}`} flexDirection="row" paddingLeft={2}>
                <Text color="cyan">{fit(say, 26)}</Text>
                <Text dimColor>{does}</Text>
              </Box>
            ))}
          </Box>
        )}

        {list.map((todo, i) => {
          const look = rowLook(todo, i + 1, spin ?? '', gone.has(todo.commits.at(-1) ?? ''), titleWidth)
          const older = todo.commits.slice(0, -1)
          const opens = look.opens
          const button =
            opens === null ? null : (
              <Button
                key={look.key}
                label={look.label}
                plain
                hotkey={look.hotkey}
                hover={{ color: 'cyan' }}
                onPress={() => (opens.kind === 'working' ? showWorking($) : showCommit($, opens.hash))}
              />
            )

          return (
            <Box key={`todo-${todo.id}`} flexDirection="column">
              <Box key={`row-${todo.id}`} flexDirection="row">
                <Text color={look.iconColor} dimColor={todo.status === 'pending'} bold={todo.status === 'in_progress'}>
                  {look.icon}{' '}
                </Text>
                {button === null ? (
                  <Box flexDirection="row">
                    <Text dimColor>{look.label}</Text>
                    {look.tag?.color === undefined ? <Text dimColor>{look.tag?.text}</Text> : <Text color={look.tag.color}>{look.tag.text}</Text>}
                  </Box>
                ) : look.tag === null ? (
                  button
                ) : (
                  <Box flexDirection="row">
                    {button}
                    <Text color={look.tag.color}>{look.tag.text}</Text>
                  </Box>
                )}
              </Box>
              {older.length > 0 && (
                <Box flexDirection="row" columnGap={1} paddingLeft={6}>
                  <Text dimColor>also</Text>
                  {older.map(hash => (
                    <Box key={`c-row-${todo.id}-${hash}`}>
                      <Button
                        key={`c-${todo.id}-${hash}`}
                        label={hash.slice(0, 7)}
                        plain
                        hover={{ color: 'cyan' }}
                        onPress={() => showCommit($, hash)}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )
        })}

        {earlierTotal > 0 && before !== null && (
          <Box flexDirection="column" marginTop={1}>
            <Box key="earlier-row">
              <Button
                key="earlier"
                label={`${isOpen ? '▾' : '▸'} Earlier on this branch · ${earlierTotal} ${earlierTotal === 1 ? 'commit' : 'commits'}`}
                plain
                dimColor
                hover={{ color: 'cyan' }}
                onPress={() => update($, isEarlierOpen, value => !value)}
              />
            </Box>
            {isOpen &&
              earlierCommits.map(c => (
                <Box key={`e-row-${c.hash}`}>
                  <Button
                    key={`e-${c.hash}`}
                    label={`  ${c.hash.slice(0, 7)}  ${fit(c.subject, Math.max(8, columns - 12))}`}
                    plain
                    hover={{ color: 'cyan' }}
                    onPress={() => showCommit($, c.hash)}
                  />
                </Box>
              ))}
            {isOpen && more > 0 && (
              <Text dimColor>
                {'  '}and {more} more (since {before.base})
              </Text>
            )}
          </Box>
        )}
        {list.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>Tip: "add a todo: …" · "go" to start · /todos add … · /todos clear</Text>
          </Box>
        )}
      </Box>
    )
  })

  // The todo tool's calls draw as one line; the pane shows the list itself.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, input, isErrored, isInterrupted } = e.props
    if (tool !== TOOL || isErrored || isInterrupted) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const { icon, color, text } = toolRowLine((input ?? {}) as TodosInput, await read($, todos))

    return (
      <Box flexDirection="row">
        <Text color={color}>{icon} </Text>
        <Text dimColor wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isErrored) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
}
