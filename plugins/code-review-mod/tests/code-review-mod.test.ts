import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__code-review-mod__review'
const SKILL = 'mattpocock-skills:code-review'
const HEAD = 'a'.repeat(40)
const PANE_PROPS = { title: 'Review', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

type World = {
  opened: { id: string; focus?: boolean }[]
  /** Every command run, as one line. */
  ran: string[]
  /** What each command answers: the first key the line starts with wins; unknown commands fail. */
  answers: Record<string, string | { exitCode: number; stdout?: string; stderr?: string }>
  /** stdin given to each command, by its line. */
  stdin: Record<string, string>
  submitted: string[]
  filled: string[]
  /** Calls made to other tools, like todo-commits'. */
  called: { tool: string; input: Record<string, unknown> }[]
  /** The tools Claude has; todo-commits' tool is there unless removed. */
  tools: string[]
  /** What the model answers to a draft rewrite; undefined gives no answer. */
  rewrite?: string
  store: Record<string, unknown>
  sessionId: string
  clock: ReturnType<typeof mock.clock>
}

/** A fake engine beneath the plugin: commands, panes, prompts, tools and the store. */
function world(on: On, stored: Record<string, unknown> = {}): World {
  const w: World = {
    opened: [],
    ran: [],
    answers: {},
    stdin: {},
    submitted: [],
    filled: [],
    called: [],
    tools: [TOOL, 'mcp__todo-commits__todos', 'Bash'],
    store: { ...stored },
    sessionId: 's1',
    clock: undefined as never,
  }
  on('process.run', ($, e) => {
    const line = e.argv.join(' ')
    w.ran.push(line)
    if (e.init?.stdin !== undefined) w.stdin[line] = e.init.stdin
    const key = Object.keys(w.answers).find(k => line.startsWith(k))
    const answer = key === undefined ? { exitCode: 1, stderr: 'not faked' } : w.answers[key]!
    const full = typeof answer === 'string' ? { exitCode: 0, stdout: answer } : answer
    return { value: { exitCode: full.exitCode, stdout: full.stdout ?? '', stderr: full.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('ui.open', ($, e) => {
    w.opened.push({ id: e.id, focus: e.focus })
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: [...new Set(w.opened.map(o => o.id))].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('ui.close', ($, e) => {
    w.opened = w.opened.filter(o => o.id !== e.id)
    return { value: undefined } as never
  })
  on('session.start', ($, e) => e as never)
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__code-review-mod__${e.name}` } }) as never)
  on('tool.list', () => ({ value: w.tools.map(name => ({ name, description: '', mcp: name.startsWith('mcp__') })) }) as never)
  on('session.id', () => ({ value: w.sessionId }) as never)
  on('store.get', ($, e) => ({ value: w.store[e.key] }) as never)
  on('store.set', ($, e) => {
    w.store[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', ($, e) => {
    delete w.store[e.key]
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: Object.keys(w.store) }) as never)
  on('prompt.submit', ($, e) => {
    w.submitted.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.fill', ($, e) => {
    w.filled.push(e.text)
    return { value: { isFilled: true } } as never
  })
  on('model.complete', () => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return w.rewrite === undefined
      ? ({ value: { isAnswered: false, reason: 'aborted', usage } } as never)
      : ({ value: { isAnswered: true, text: w.rewrite, usage } } as never)
  })
  on('tool.call', ($, e) => {
    w.called.push({ tool: e.tool, input: e as never })
    return { result: 'ok' } as never
  })
  w.clock = mock.clock(on, { now: 1_000_000 })
  return w
}

let id = 0
/** Calls the review tool the way Claude does; answers its result text and whether it failed. */
async function review($: Engine, input: Record<string, unknown>) {
  const ran = await $.tool.call({ tool: TOOL, tool_use_id: `t${id++}`, ...input } as never)
  return { text: String((ran as { result?: unknown }).result), isError: (ran as { isError?: boolean }).isError === true }
}

const FINDING = {
  action: 'add',
  group: 'standards',
  weight: 'maybe',
  score: 4,
  file: 'src/app.ts',
  line: 12,
  title: 'Name the magic number',
  now: 'const wait = 3000',
  suggested: 'const RETRY_MS = 3000',
  why: 'A name says what 3000 is for.',
}

async function startMine($: Engine) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await review($, { action: 'start', pr: 'feature', head: HEAD })
}

async function pane($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({ plugin: 'code-review-mod', surface, component: 'Pane', requestId: 'code-review-mod', props: PANE_PROPS })
}

/** All the text drawn in the pane, Button labels included, one line per element in drawing order. */
async function paneText($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  const drawn = await pane($, surface)
  const all = await drawn.findAll({})
  await drawn.unmount()
  return all
    .filter(el => el.type === 'Text' || el.type === 'Button')
    .map(el => (el.type === 'Button' ? String(el.props.label) : el.text))
    .join('\n')
}

test('the code-review skill opens the panel and carries the rule', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const prompted = await $.skill.prompt({ skill: SKILL, text: 'Review the branch.' })

  expect(prompted.text).toMatch(/^Review the branch\./)
  expect(prompted.text).toMatch(TOOL)
  expect(prompted.text).toMatch('9-10 a bug or a broken spec')
  expect(w.opened.map(o => o.id)).toEqual(['code-review-mod'])
})

test('the built-in /code-review is left alone', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const prompted = await $.skill.prompt({ skill: 'code-review', text: 'Built-in review.' })

  expect(prompted.text).toBe('Built-in review.')
  expect(w.opened).toEqual([])
})

test('start, add and skipped each answer in one line, and the finding shows in the panel', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const started = await review($, { action: 'start', pr: 'feature', head: HEAD })
  const added = await review($, FINDING)
  const skipped = await review($, { action: 'skipped', group: 'spec', reason: 'no spec found' })

  for (const answer of [started, added, skipped]) {
    expect(answer.isError).toBe(false)
    expect(answer.text.includes('\n')).toBe(false)
  }
  expect(added.text).toMatch('#1')
  expect(await paneText($)).toMatch('Name the magic number')
})

test('a finding with a bad score, or before any start, is refused', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await review($, FINDING)).isError).toBe(true)
  await review($, { action: 'start', pr: 'feature', head: HEAD })
  const bad = await review($, { ...FINDING, score: 11 })
  expect(bad.isError).toBe(true)
  expect(bad.text).toMatch('score')
  expect((await review($, { action: 'nope' })).isError).toBe(true)
})

test('the rule is in the system prompt only while there is a review', async ($, on) => {
  world(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  const compose = () => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await compose()).sections.map(s => s.id)).toEqual(['intro'])
  await review($, { action: 'start', pr: 'feature', head: HEAD })
  expect((await compose()).sections.map(s => s.id)).toEqual(['intro', 'code-review-mod:rule'])
})

test('review tool calls draw as one line in the chat', async ($, on) => {
  world(on)
  await startMine($)
  await review($, FINDING)

  const row = await $.ui.mount({ plugin: 'code-review-mod', surface: 'terminal', component: 'ToolUse', requestId: 'r1', props: { tool_use_id: 'r1', tool: TOOL, input: FINDING, isRunning: false, isErrored: false, isInterrupted: false, output: 'x' } as never })
  const texts = (await row.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(texts).toMatch('Name the magic number')
  const result = await $.ui.mount({ plugin: 'code-review-mod', surface: 'terminal', component: 'ToolResult', requestId: 'res', props: { tool_use_id: 'res', tool: TOOL, output: 'x', isErrored: false } as never })
  expect((await result.findAll({ type: 'Text' })).length).toBe(0)
})

test('the panel shows Standards then Spec, sorted by score, with a skipped Spec explained', async ($, on) => {
  world(on)
  await startMine($)
  await review($, { ...FINDING, title: 'Low one', score: 2 })
  await review($, { ...FINDING, title: 'High one', score: 8, weight: 'must', file: 'src/b.ts', line: 3 })
  await review($, { action: 'skipped', group: 'spec', reason: 'no spec found' })

  const text = await paneText($)
  expect(text.indexOf('Standards')).toBeLessThan(text.indexOf('High one'))
  expect(text.indexOf('High one')).toBeLessThan(text.indexOf('Low one'))
  expect(text.indexOf('Low one')).toBeLessThan(text.indexOf('Spec'))
  expect(text).toMatch('skipped, no spec found')
  expect(text).toMatch(/8 +must +src\/b\.ts:3/)
  const drawn = await pane($)
  const low = (await drawn.findAll({ type: 'Button' })).find(b => String(b.props.label).includes('Low one'))
  expect(low?.props.dimColor).toBe(true)
})

test('a group with no findings says nothing found', async ($, on) => {
  world(on)
  await startMine($)
  await review($, FINDING)

  expect(await paneText($)).toMatch(/Spec\s+nothing found/)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`opening a finding shows the code now, the suggested code, then why it matters (${surface})`, async ($, on) => {
    const w = world(on)
    await startMine($)
    await review($, FINDING)

    const drawn = await pane($, surface)
    await drawn.press({ key: 'f-1' })
    const codes = await drawn.findAll({ type: 'Code' })
    expect(codes.map(c => c.props.source)).toEqual(['const wait = 3000', '@@ -12,1 +12,1 @@\n-const wait = 3000\n+const RETRY_MS = 3000'])
    expect(codes[0]!.props.path).toBe('src/app.ts')
    expect(codes[1]!.props.format).toBe('diff')
    const texts = (await drawn.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts).toContain('Why it matters')
    expect(texts).toContain('A name says what 3000 is for.')
    expect(w.opened.at(-1)).toEqual({ id: 'code-review-mod', focus: undefined })

    // The test kit cannot send a close made by the person (Esc); Back runs the same step.
    await drawn.press({ key: 'back' })
    expect(await drawn.find({ key: 'f-1' })).toBeDefined()
    await drawn.unmount()
  })
}

test('a finding with no suggested code says so', async ($, on) => {
  world(on)
  await startMine($)
  await review($, { ...FINDING, suggested: '' })
  const drawn = await pane($)
  await drawn.press({ key: 'f-1' })

  expect((await drawn.findAll({ type: 'Code' })).length).toBe(1)
  expect((await drawn.findAll({ type: 'Text' })).map(t => t.text)).toContain('No code change suggested.')
})

test('the top row shows the PR, whose it is and the counts; the tip fits the mode', async ($, on) => {
  world(on)
  await startMine($)
  await review($, FINDING)
  await review($, { ...FINDING, title: 'Second' })

  const mine = await paneText($)
  expect(mine).toMatch('feature')
  expect(mine).toMatch('your PR')
  expect(mine).toMatch('2 open · 0 pending · 0 done')
  expect(mine).toMatch('"fix 3"')
  expect(mine).toMatch('one review per session')

  await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })
  const theirs = await paneText($)
  expect(theirs).toMatch('acme/shop#7')
  expect(theirs).toMatch('their PR')
  expect(theirs).toMatch('Submit')
  expect(theirs).toMatch('one review per session')
})
