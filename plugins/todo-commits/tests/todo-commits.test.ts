import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

const SHOW = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 111..222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,2 +1,2 @@',
  '-const x = 1',
  '+const x = 2',
  ' export { x }',
  '',
].join('\n')

const PANE_PROPS = { title: 'Todos', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

/** The hashes drawn under todo 1, read off the drawn panel. */
async function hashesOfTodo1($: Engine) {
  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  const buttons = await pane.findAll({ type: 'Button' })
  return buttons.map(b => b.key).filter(k => k?.startsWith('c-1-')).map(k => k!.slice(4))
}

type Repo = {
  head: string
  log: string[]
  opened: string[]
  asked: number
  top: string
  branch: string
  /** The main branch, or undefined for a repo that has none. */
  base?: string
  earlier: { hash: string; subject: string }[]
  status: string
  numstat: string
  /** What the model answers when asked to tidy a todo title; undefined fails the call. */
  tidy?: string
  /** Commits no longer on the branch. */
  gone: string[]
  workingDiff: string
  untracked: string[]
}

/** A fake repo whose HEAD the test moves, and a fake tool layer beneath the plugin. */
function world(on: On, show = SHOW, stored: Record<string, unknown> = {}) {
  const repo: Repo & { data?: Record<string, unknown> } = { head: A, log: [A], opened: [], asked: 0, top: '/repo', branch: 'feature', earlier: [], status: '', numstat: '', gone: [], workingDiff: '', untracked: [] }

  on('process.run', ($, e) => {
    const [, cmd, ...rest] = e.argv
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const fail = { value: { exitCode: 1, stdout: '', stderr: 'no', isStdoutTruncated: false, isStderrTruncated: false } }
    if (cmd === 'rev-parse' && rest[0] === '--show-toplevel') return ok(`${repo.top}\n`)
    if (cmd === 'rev-parse' && rest[0] === '--abbrev-ref') return ok(`${repo.branch}\n`)
    if (cmd === 'rev-parse' && rest[0] === '--verify') return rest.at(-1) === repo.base ? ok(`${A}\n`) : fail
    if (cmd === 'rev-parse') return ok(`${repo.head}\n`)
    if (cmd === 'symbolic-ref') return fail
    if (cmd === 'rev-list' && rest[0] === '--count') return ok(`${repo.earlier.length}\n`)
    if (cmd === 'rev-list') {
      const from = rest.at(-1)!.split('..')[0]!
      return ok(repo.log.slice(repo.log.indexOf(from) + 1).join('\n') + '\n')
    }
    if (cmd === 'log' && rest[0] === '-1') return ok('Add the x constant\n')
    if (cmd === 'log') return ok(repo.earlier.map(c => `${c.hash}\x1f${c.subject}`).join('\n') + '\n')
    if (cmd === 'show') return ok(show)
    if (cmd === 'status') return ok(repo.status)
    if (cmd === 'diff' && rest.includes('--numstat')) return ok(repo.numstat)
    if (cmd === 'diff' && rest.includes('--no-index')) {
      const path = rest.at(-1)!
      return { value: { exitCode: 1, stdout: `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+hello\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (cmd === 'diff') return ok(repo.workingDiff)
    if (cmd === 'ls-files') return ok(repo.untracked.join('\n'))
    if (cmd === 'merge-base') return repo.gone.includes(rest[1]!) ? fail : ok('')
    return fail
  })
  const data: Record<string, unknown> = { ...stored }
  on('store.get', ($, e) => ({ value: data[e.key] }) as never)
  on('store.set', ($, e) => {
    data[e.key] = e.value
    return { value: undefined } as never
  })
  on('ui.open', ($, e) => {
    repo.opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: repo.opened.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.close', ($, e) => {
    repo.opened = repo.opened.filter(id => id !== e.id)
    return { value: undefined } as never
  })
  on('session.start', ($, e) => e as never)
  on('tool.register', ($, e) => ({ value: { tool: `mcp__todo-commits__${e.name}` } }) as never)
  const clock = mock.clock(on, { now: 1000 })
  ;(repo as Repo & { clock?: typeof clock }).clock = clock
  on('model.complete', ($, e) => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    if (e.system?.includes('todo title')) {
      return repo.tidy === undefined
        ? ({ value: { isAnswered: false, reason: 'aborted', usage } } as never)
        : ({ value: { isAnswered: true, text: repo.tidy, usage } } as never)
    }
    repo.asked += 1
    const text = '[{"path": "tests/__snapshots__/app.snap", "isWorth": false, "reason": "Generated snapshot output."}]'
    return { value: { isAnswered: true, text, usage } } as never
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: '1', subject: e.subject } } } as never
    if (e.tool === 'TaskUpdate') return { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } } as never
    return { result: { stdout: '', stderr: '', interrupted: false } } as never
  })

  repo.data = data
  return repo
}

test('a commit made during an in-progress todo is linked to it', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 't1', subject: 'Change x', description: 'x to 2' } as never)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 't2', taskId: '1', status: 'in_progress' } as never)

  repo.log.push(B, C)
  repo.head = C
  await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'git commit -m x' } as never)

  expect((await hashesOfTodo1($)).sort()).toEqual([B, C])
  expect(repo.opened).toContain('todo-commits')
})

test('a commit made right after the todo closed still goes to it', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 't1', subject: 'Change x', description: '' } as never)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 't2', taskId: '1', status: 'in_progress' } as never)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 't3', taskId: '1', status: 'completed' } as never)

  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 't4', command: 'git commit -m x' } as never)

  expect(await hashesOfTodo1($)).toEqual([B])
})

test('the commit rule is added only while the panel is open', async ($, on) => {
  const repo = world(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  const compose = () => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })

  expect((await compose()).sections.map(s => s.id)).toEqual(['intro'])
  repo.opened.push('todo-commits')
  const sections = (await compose()).sections
  expect(sections.map(s => s.id)).toEqual(['intro', 'todo-commits:commit-rule'])
  const rule = sections[1]!.text
  expect(rule).toMatch('mcp__todo-commits__todos')
  expect(rule).not.toMatch('TaskCreate')
  expect(rule).toMatch("Don't start the work until the user says to go ahead.")
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`clicking a hash shows its message and diff (${surface})`, async ($, on) => {
    const repo = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'TaskCreate', tool_use_id: 't1', subject: 'Change x', description: '' } as never)
    await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 't2', taskId: '1', status: 'in_progress' } as never)
    repo.log.push(B)
    repo.head = B
    await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'git commit -m x' } as never)

    const pane = await $.ui.mount({
      plugin: 'todo-commits',
      surface,
      component: 'Pane',
      requestId: 'todo-commits',
      props: { title: 'Todos', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    })
    expect(String((await pane.find({ key: `c-1-${B}` }))?.props.label)).toMatch(/Change x\s+bbbbbbb$/)
    await pane.press({ key: `c-1-${B}` })
    const shown = pane
    expect((await shown.find({ text: 'Add the x constant' })) !== undefined).toBe(true)
    const code = await shown.find({ type: 'Code' })
    expect(code?.props.source).toBe('@@ -1,2 +1,2 @@\n-const x = 1\n+const x = 2\n export { x }')
    expect(code?.props.format).toBe('diff')
  })
}

const TODOS = 'mcp__todo-commits__todos'

const squash = (text: unknown) => String(text).replace(/\s+/g, ' ').trim()

/** The panel's texts and buttons, whitespace squashed. */
async function rows($: Engine) {
  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  const texts = (await pane.findAll({ type: 'Text' })).map(t => squash(t.text))
  const buttons = (await pane.findAll({ type: 'Button' })).map(b => `${String(b.props.hotkey)}: ${squash(b.props.label)}`)
  return { texts, buttons }
}

test('the todos tool adds steps as not started and opens the panel', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const added = await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Delete dead code', 'Simplify menu.js'] } as never)
  expect(added.text ?? String(added.result)).toMatch('1. [pending] Delete dead code\n2. [pending] Simplify menu.js')
  expect(repo.opened).toContain('todo-commits')
  const drawn = await rows($)
  expect(drawn.texts).toContain('1: Delete dead code')
  expect(drawn.texts).toContain('2: Simplify menu.js')
  expect(drawn.texts).toContain('0/2')
})

test('start, commit, done links the commit to that todo', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Delete dead code', 'Simplify menu.js'] } as never)

  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'git commit -m x' } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u4', action: 'done', number: 1 } as never)

  const drawn = await rows($)
  expect(drawn.buttons).toEqual(['1: Delete dead code bbbbbbb'])
  expect(drawn.texts).toContain('✔')
  expect(drawn.texts).toContain('2: Simplify menu.js')
  expect(drawn.texts).toContain('1/2')
})

test('a bad number is refused without changing the list', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Only one'] } as never)

  const answer = await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 5 } as never)
  expect(answer.text ?? String(answer.result)).toMatch('No todo number 5. There are 1.')
  expect((await rows($)).texts).toContain('1: Only one')
})

/** One hunk of `n` removed and `n` added lines, each `width` characters wide. */
function hunk(start: number, n: number, width = 60) {
  const old = Array.from({ length: n }, () => `-old ${'x'.repeat(width)}`)
  const add = Array.from({ length: n }, () => `+new ${'y'.repeat(width)}`)
  return [`@@ -${start},${n} +${start},${n} @@`, ...old, ...add, ''].join('\n')
}

function fileDiff(path: string, hunks: string[]) {
  return `diff --git a/${path} b/${path}\nindex 111..222 100644\n--- a/${path}\n+++ b/${path}\n${hunks.join('')}`
}

/** Makes one commit under todo 1, presses it, and draws the commit pane. */
async function openCommit($: Engine, on: On, show: string, surface: 'terminal' | 'desktop' = 'terminal') {
  const repo = world(on, show)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Big change'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'git commit -m x' } as never)
  const list = await $.ui.mount({ plugin: 'todo-commits', surface, component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  const row = (await list.findAll({ type: 'Button' }))[0]!
  await list.press({ key: row.key! })
  return { repo, pane: list }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a diff over the size limit is split at hunk edges and still draws (${surface})`, async ($, on) => {
    const { pane, repo } = await openCommit($, on, fileDiff('src/menu.js', [hunk(1, 40), hunk(100, 40), hunk(200, 40)]), surface)
    const codes = await pane.findAll({ type: 'Code' })
    expect(codes.length).toBe(3)
    for (const code of codes) {
      expect(String(code.props.source)).toStartWith('@@ ')
      expect(String(code.props.source).length).toBeLessThanOrEqual(10000)
    }
    expect(repo.asked).toBe(0)
  })
}

test('one hunk too long for a diff block is drawn line by line', async ($, on) => {
  const { pane } = await openCommit($, on, fileDiff('src/menu.js', [hunk(1, 100)]))
  expect(await pane.find({ type: 'Code' })).toBe(undefined)
  const added = await pane.find({ text: /^\+new y+$/ })
  expect(added?.props.color).toBe('green')
})

test('a large file starts folded with the model verdict, and Show diff opens it', async ($, on) => {
  const snap = fileDiff('tests/__snapshots__/app.snap', [hunk(1, 250, 20)])
  const { pane, repo } = await openCommit($, on, SHOW + snap)
  expect(repo.asked).toBe(1)
  expect((await pane.find({ text: 'Probably skip: Generated snapshot output.' })) !== undefined).toBe(true)
  // The small file still shows; the snapshot does not until asked.
  expect((await pane.findAll({ type: 'Code' })).length).toBe(1)

  expect(await pane.find({ text: /^\+new y+$/ })).toBe(undefined)
  await pane.press({ key: 't-tests/__snapshots__/app.snap' })
  expect((await pane.find({ text: /^\+new y+$/ }))?.props.color).toBe('green')
  expect((await pane.find({ key: 't-tests/__snapshots__/app.snap' }))?.props.label).toBe('Hide diff')
})

test('the list is saved per branch and comes back in a new session', async ($, on) => {
  const saved = [{ id: 'm1', title: 'Saved step', status: 'completed', commits: [B] }]
  world(on, SHOW, { 'todos:/repo#feature': saved })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const drawn = await rows($)
  expect(drawn.buttons).toEqual(['1: Saved step bbbbbbb'])
  expect(drawn.texts).toContain('🌿 feature')
})

test('adding todos saves them under this repo and branch', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Keep me'] } as never)

  expect(repo.data!['todos:/repo#feature']).toEqual([expect.objectContaining({ title: 'Keep me', status: 'pending' })])
})

test('switching branch swaps the list and links no commits', async ($, on) => {
  const repo = world(on, SHOW, { 'todos:/repo#other': [{ id: 'o1', title: 'Other branch step', status: 'pending', commits: [] }] })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Feature step'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)

  repo.branch = 'other'
  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'git checkout other' } as never)

  const drawn = await rows($)
  expect(drawn.texts).toContain('1: Other branch step')
  expect(drawn.buttons).toEqual([])
})

test('earlier commits on the branch show folded, and open on press', async ($, on) => {
  const repo = world(on)
  repo.base = 'main'
  repo.earlier = [
    { hash: C, subject: 'Older work from yesterday' },
    { hash: B, subject: 'First commit on the branch' },
  ]
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  expect((await pane.find({ key: 'earlier' }))?.props.label).toBe('▸ Earlier on this branch · 2 commits')
  expect(await pane.find({ key: `e-${C}` })).toBe(undefined)

  await pane.press({ key: 'earlier' })
  expect(squash((await pane.find({ key: `e-${C}` }))?.props.label)).toBe('ccccccc Older work from yesterday')
  await pane.press({ key: `e-${C}` })
  expect((await pane.find({ key: 'back' }))?.props.label).toBe('← Back to todos')
})

test('on the main branch itself there is no earlier section', async ($, on) => {
  const repo = world(on)
  repo.base = 'main'
  repo.branch = 'main'
  repo.earlier = [{ hash: C, subject: 'x' }]
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  expect(await pane.find({ key: 'earlier' })).toBe(undefined)
})

test('a todo marked done without a commit is flagged', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Forgot to commit'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u3', action: 'done', number: 1 } as never)

  const drawn = await rows($)
  expect(drawn.texts).toContain('⚠')
  expect(drawn.texts).toContain('no commit')
})

test('the spinner turns while a todo is in progress', async ($, on) => {
  const repo = world(on) as Repo & { clock: { advance: (ms: number) => Promise<void> } }
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Working'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)

  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  const icon = async () => squash((await pane.findAll({ type: 'Text' }))[4]?.text)
  const first = await icon()
  await repo.clock.advance(125)
  const second = await icon()
  expect(['⠋', '⠙', '⠹']).toContain(first)
  expect(second).not.toBe(first)
})

test('/todos add puts a row in the panel without Claude', async ($, on) => {
  world(on) // no tidy answer: the typed words stay
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'todos', args: 'add one more item to bump the theme version' } as never)

  expect(ran.text).toBe('Added todo 1: one more item to bump the theme version')
  expect((await rows($)).texts).toContain('1: one more item to bump the theme version')
})

test('/todos add with no text explains how to use it', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'todos', args: 'add' } as never)

  expect(ran.text).toMatch('Nothing added')
})

test('tips show in full when empty and as one line once there are todos', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  const texts = async () => (await pane.findAll({ type: 'Text' })).map(t => squash(t.text))

  expect(await texts()).toContain('No todos yet. Try:')
  expect(await texts()).toContain('/todos add …')

  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['One'] } as never)
  expect(await texts()).not.toContain('No todos yet. Try:')
  expect(await texts()).toContain('Tip: "add a todo: …" · "go" to start · /todos add … · /todos clear')
})

test('/todos add tidies the typed words into a short title', async ($, on) => {
  const repo = world(on)
  repo.tidy = '"Bump the theme version."'
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'todos', args: 'add one more item to bump the theme version' } as never)

  expect(ran.text).toBe('Added todo 1: Bump the theme version')
  expect((await rows($)).texts).toContain('1: Bump the theme version')
  expect(repo.data!['todos:/repo#feature']).toEqual([expect.objectContaining({ title: 'Bump the theme version' })])
})

/** Two todos, each with its own commit, drawn in the one panel. */
async function twoCommits($: Engine, on: On) {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['First', 'Second'] } as never)
  for (const [n, hash] of [[1, B], [2, C]] as const) {
    await $.tool.call({ tool: TODOS, tool_use_id: `s${n}`, action: 'start', number: n } as never)
    repo.log.push(hash)
    repo.head = hash
    await $.tool.call({ tool: 'Bash', tool_use_id: `b${n}`, command: 'git commit' } as never)
    await $.tool.call({ tool: TODOS, tool_use_id: `d${n}`, action: 'done', number: n } as never)
  }
  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  return { repo, pane }
}

test('a commit opens in the same panel, and Back returns to the list', async ($, on) => {
  const { pane } = await twoCommits($, on)
  const ids = (await pane.findAll({ type: 'Button' })).map(b => b.key!)
  expect(ids.length).toBe(2)

  await pane.press({ key: ids[0]! })
  expect((await pane.find({ text: 'bbbbbbb' })) !== undefined).toBe(true)
  await pane.press({ key: 'back' })
  expect((await pane.find({ key: ids[1]! })) !== undefined).toBe(true)

  // The second commit opens straight away too: no tab to click.
  await pane.press({ key: ids[1]! })
  expect((await pane.find({ text: 'ccccccc' })) !== undefined).toBe(true)
})

/** Opens the pane, adds a todo and starts it, then runs one Edit under it. */
async function editUnderTodo($: Engine, on: On) {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todos', args: '' } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Change a'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  repo.status = ' M src/a.js\n?? src/new.js\n'
  repo.numstat = '1\t1\tsrc/a.js\n'
  repo.workingDiff = '-a\n'.length ? 'diff --git a/src/a.js b/src/a.js\nindex 1..2 100644\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1,2 +1,2 @@\n-a\n+b\n c\n' : ''
  repo.untracked = ['src/new.js']
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/a.js', old_string: 'a', new_string: 'b' } as never)
  return repo
}

test('clicking the todo in progress shows the uncommitted diff, new files included', async ($, on) => {
  await editUnderTodo($, on)
  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  const buttons = await pane.findAll({ type: 'Button' })
  // No live line any more: the row itself is the way in.
  expect(buttons.map(b => `${String(b.props.hotkey)}: ${squash(b.props.label)}`)).toEqual(['1: Change a —'])
  expect((await pane.findAll({ type: 'Text' })).some(t => t.text.includes('not committed'))).toBe(false)

  await pane.press({ key: buttons[0]!.key! })
  expect((await pane.find({ text: 'Uncommitted' })) !== undefined).toBe(true)
  const codes = await pane.findAll({ type: 'Code' })
  expect(codes.map(c => c.props.path)).toEqual(['src/a.js', 'src/new.js'])
})

test('a commit no longer on the branch is tagged dropped', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Gone soon'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'git commit -m x' } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u4', action: 'done', number: 1 } as never)
  const pane = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'Pane', requestId: 'todo-commits', props: PANE_PROPS })
  expect(squash((await pane.findAll({ type: 'Button' }))[0]?.props.label)).toBe('Gone soon bbbbbbb')

  repo.head = A
  repo.gone = [B]
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u5', command: 'git reset --hard HEAD~1' } as never)
  expect(squash((await pane.findAll({ type: 'Button' }))[0]?.props.label)).toBe('Gone soon')
  const texts = (await pane.findAll({ type: 'Text' })).map(t => squash(t.text))
  expect(texts).toContain('dropped')
})

test('/todos clear empties the list', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['One', 'Two'] } as never)
  const ran = await $.command.run({ command: 'todos', args: 'clear' } as never)

  expect(ran.text).toMatch('Cleared 2 todos.')
  expect(repo.data!['todos:/repo#feature']).toEqual([])
  expect((await rows($)).texts).toContain('No todos yet. Try:')
})

/** A todo tool row's props, as the transcript would draw it. */
function todoRow(input: Record<string, unknown>, isErrored = false) {
  return { tool_use_id: 'r1', tool: TODOS, input, isRunning: false, isErrored, isInterrupted: false, output: 'x' } as never
}

test('start and done answer Claude in one line; add still sends the list', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const added = await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['One', 'Two'] } as never)
  expect(added.text ?? String(added.result)).toBe('1. [pending] One\n2. [pending] Two')

  const started = await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 2 } as never)
  expect(started.text ?? String(started.result)).toBe('Started 2: Two')
  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'git commit' } as never)
  const done = await $.tool.call({ tool: TODOS, tool_use_id: 'u4', action: 'done', number: 2 } as never)
  expect(done.text ?? String(done.result)).toBe('Done 2: Two (1 of 2 done)')
})

test('todo tool calls draw as one line in the main window', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['Add a comment'] } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  repo.log.push(B)
  repo.head = B
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'git commit' } as never)
  await $.tool.call({ tool: TODOS, tool_use_id: 'u4', action: 'done', number: 1 } as never)

  const cases: [Record<string, unknown>, string][] = [
    [{ action: 'add', titles: ['Add a comment'] }, '☐ Added: Add a comment'],
    [{ action: 'add', titles: ['One', 'Two', 'Three'] }, '☐ Added 3 todos: One…'],
    [{ action: 'start', number: 1 }, '▸ Started 1: Add a comment'],
    [{ action: 'done', number: 1 }, '✔ Done 1: Add a comment · bbbbbbb'],
    [{ action: 'clear' }, '⊘ Cleared the todos'],
  ]
  let i = 0
  for (const [input, line] of cases) {
    const row = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'ToolUse', requestId: `r${i++}`, props: todoRow(input) })
    const texts = (await row.findAll({ type: 'Text' })).map(t => squash(t.text))
    expect(texts.join(' ')).toBe(line)
  }

  const result = await $.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'ToolResult', requestId: 'res', props: { tool_use_id: 'res', tool: TODOS, output: 'x', isErrored: false } as never })
  expect(await result.findAll({ type: 'Text' })).toEqual([])
})

test('a failed todo tool call keeps its full row', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const answer = await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'start', number: 9 } as never)
  expect(answer.isError).toBe(true)
  // The plugin passes the errored row on; nothing beneath it draws in a test.
  await expect($.ui.mount({ plugin: 'todo-commits', surface: 'terminal', component: 'ToolUse', requestId: 'r1', props: todoRow({ action: 'start', number: 9 }, true) })).rejects.toThrow()
})

test('a todo tool call opens the panel when it was closed', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TODOS, tool_use_id: 'u1', action: 'add', titles: ['One'] } as never)
  expect(repo.opened).toContain('todo-commits')

  repo.opened = [] // the person closed it
  await $.tool.call({ tool: TODOS, tool_use_id: 'u2', action: 'start', number: 1 } as never)
  expect(repo.opened).toEqual(['todo-commits'])
})

test('/todos toggles the panel; add and clear never close it', async ($, on) => {
  const repo = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'todos', args: '' } as never)).text).toMatch('Todo panel opened')
  expect(repo.opened).toEqual(['todo-commits'])

  expect((await $.command.run({ command: 'todos', args: '' } as never)).text).toMatch('Todo panel closed')
  expect(repo.opened).toEqual([])

  await $.command.run({ command: 'todos', args: '' } as never)
  await $.command.run({ command: 'todos', args: 'add Keep it open' } as never)
  await $.command.run({ command: 'todos', args: 'clear' } as never)
  expect(repo.opened.includes('todo-commits')).toBe(true)
})
