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
  /** The context each submitted prompt carried. */
  contexts: (readonly string[] | undefined)[]
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
    contexts: [],
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
    w.contexts.push(e.context)
    return { text: e.text } as never
  })
  on('prompt.fill', ($, e) => {
    w.filled.push(e.text)
    return { isFilled: true } as never
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
  const asked = await pane($)
  await asked.press({ key: 'replace' })
  await asked.unmount()
  const theirs = await paneText($)
  expect(theirs).toMatch('acme/shop#7')
  expect(theirs).toMatch('their PR')
  expect(theirs).toMatch('Submit')
  expect(theirs).toMatch('one review per session')
})

test('the mode switch in the panel flips between your PR and their PR', async ($, on) => {
  world(on)
  await startMine($)
  const drawn = await pane($)

  await drawn.press({ key: 'mode' })
  expect(String((await drawn.find({ key: 'mode' }))?.props.label)).toMatch('their PR')
  await drawn.press({ key: 'mode' })
  expect(String((await drawn.find({ key: 'mode' }))?.props.label)).toMatch('your PR')
})

/** Each Text drawn, trimmed. */
async function texts(drawn: { findAll: (q: { type: 'Text' }) => Promise<{ text: string }[]> }) {
  return (await drawn.findAll({ type: 'Text' })).map(t => t.text.trim())
}

/** Starts a review of your branch with one finding and opens it in the pane. */
async function openMine($: Engine) {
  await startMine($)
  await review($, FINDING)
  const drawn = await pane($)
  await drawn.press({ key: 'f-1' })
  return drawn
}

test('Fix it adds a todo in todo-commits and marks the finding fixing', async ($, on) => {
  const w = world(on)
  const drawn = await openMine($)

  await drawn.press({ key: 'fix' })

  expect(w.called.map(c => [c.tool, c.input.action, c.input.titles])).toEqual([['mcp__todo-commits__todos', 'add', ['Fix review #1: Name the magic number']]])
  expect(w.submitted).toEqual([])
  expect(await texts(drawn)).toContain('fixing')
  expect((await drawn.findAll({ type: 'Text' })).map(t => t.text).join(' ')).toMatch('0 open · 1 pending · 0 done')
})

test('without todo-commits, Fix it asks Claude to fix that one finding now', async ($, on) => {
  const w = world(on)
  w.tools = w.tools.filter(t => !t.startsWith('mcp__todo-commits'))
  const drawn = await openMine($)

  await drawn.press({ key: 'fix' })

  expect(w.called).toEqual([])
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]).toMatch('#1')
  expect(w.submitted[0]).toMatch('src/app.ts:12')
  expect(w.submitted[0]).toMatch('const RETRY_MS = 3000')
})

test("Won't fix closes a finding without changing code", async ($, on) => {
  const w = world(on)
  const drawn = await openMine($)

  await drawn.press({ key: 'wontfix' })

  expect(w.called).toEqual([])
  expect(await texts(drawn)).toContain("won't fix")
  expect((await drawn.findAll({ type: 'Text' })).map(t => t.text).join(' ')).toMatch('0 open · 0 pending · 1 done')
})

test('Ask Claude puts the finding in the prompt box for a question', async ($, on) => {
  const w = world(on)
  const drawn = await openMine($)

  await drawn.press({ key: 'ask' })

  expect(w.filled).toEqual(['About review finding #1 (Name the magic number, src/app.ts:12): '])
})

test('"fix 3" in chat works through set-status, and fixed marks it done', async ($, on) => {
  const w = world(on)
  await startMine($)
  await review($, FINDING)

  const fixing = await review($, { action: 'set-status', number: 1, status: 'fixing' })
  expect(fixing.isError).toBe(false)
  expect(fixing.text).toMatch('todo')
  expect(w.called.map(c => c.input.action)).toEqual(['add'])

  await review($, { action: 'set-status', number: 1, status: 'fixed' })
  expect(await paneText($)).toMatch('0 open · 0 pending · 1 done')
  expect((await review($, { action: 'set-status', number: 9, status: 'fixed' })).isError).toBe(true)
  expect((await review($, { action: 'set-status', number: 1, status: 'posted' })).isError).toBe(true)
})

const THEIRS = { ...FINDING, comment: 'Could this number get a name, so readers know it is the retry wait?' }

/** Starts a review of their PR with one finding and opens it in the pane. */
async function openTheirs($: Engine, finding: Record<string, unknown> = THEIRS) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })
  await review($, finding)
  const drawn = await pane($)
  await drawn.press({ key: 'f-1' })
  return drawn
}

test('on their PR a finding shows the comment draft under why it matters, with the suggested code', async ($, on) => {
  world(on)
  const drawn = await openTheirs($)

  const shown = await texts(drawn)
  expect(shown.indexOf('Why it matters')).toBeLessThan(shown.indexOf('Comment for the author'))
  expect(shown).toContain('Could this number get a name, so readers know it is the retry wait?')
  expect((await drawn.findAll({ type: 'Code' })).map(c => c.props.source)).toContain('const RETRY_MS = 3000')
  expect(await drawn.find({ key: 'fix' })).toBeUndefined()
  for (const key of ['drop', 'edit', 'rewrite']) expect(await drawn.find({ key })).toBeDefined()
})

test('Drop skips a finding on their PR', async ($, on) => {
  world(on)
  const drawn = await openTheirs($)

  await drawn.press({ key: 'drop' })

  expect(await texts(drawn)).toContain('dropped')
  expect(await texts(drawn)).toContain('0 open · 0 pending · 1 done')
})

test('Edit changes the draft text directly', async ($, on) => {
  world(on)
  const drawn = await openTheirs($)

  await drawn.press({ key: 'edit' })
  await drawn.input({ key: 'edit-input', text: 'Maybe name this constant?' })

  expect(await texts(drawn)).toContain('Maybe name this constant?')
  expect(await drawn.find({ key: 'edit-input' })).toBeUndefined()
})

test('Rewrite sends the draft and a note to Claude and shows the new draft', async ($, on) => {
  const w = world(on)
  const drawn = await openTheirs($)
  w.rewrite = '{"text": "Would a named constant help here?", "hasCode": false}'

  await drawn.press({ key: 'rewrite' })
  await drawn.input({ key: 'rewrite-input', text: 'softer, drop the code' })

  expect(await texts(drawn)).toContain('Would a named constant help here?')
  expect((await drawn.findAll({ type: 'Code' })).map(c => c.props.source)).not.toContain('const RETRY_MS = 3000')
})

test('a rewrite with no answer keeps the draft and says so', async ($, on) => {
  world(on)
  const drawn = await openTheirs($)

  await drawn.press({ key: 'rewrite' })
  await drawn.input({ key: 'rewrite-input', text: 'softer' })

  expect(await texts(drawn)).toContain('Could this number get a name, so readers know it is the retry wait?')
  expect((await texts(drawn)).join(' ')).toMatch('Rewrite failed')
})

const POST = 'gh api repos/acme/shop/pulls/7/reviews --method POST --input -'

test('Add to review puts a draft in the pending pile without posting it; Remove takes it out', async ($, on) => {
  const w = world(on)
  const drawn = await openTheirs($)

  await drawn.press({ key: 'pending' })
  expect(await texts(drawn)).toContain('in review')
  expect(String((await drawn.find({ key: 'submit' }))?.props.label)).toBe('1 pending · Submit review')
  expect(w.ran).not.toContain(POST)

  await drawn.press({ key: 'f-1' })
  expect(String((await drawn.find({ key: 'pending' }))?.props.label)).toBe('Remove from review')
  await drawn.press({ key: 'pending' })
  expect(await drawn.find({ key: 'submit' })).toBeUndefined()
  expect(await texts(drawn)).toContain('1 open · 0 pending · 0 done')
})

test('Submit asks first, with Comment picked, then posts one review with each comment on its line', async ($, on) => {
  const w = world(on)
  w.answers[POST] = '{"id": 1}'
  const drawn = await openTheirs($)
  await drawn.press({ key: 'pending' })

  await drawn.press({ key: 'submit' })
  expect(w.ran).not.toContain(POST)
  expect(String((await drawn.find({ key: 'event-COMMENT' }))?.props.label)).toMatch('●')
  expect(String((await drawn.find({ key: 'event-APPROVE' }))?.props.label)).toMatch('○')
  await drawn.press({ key: 'post' })

  expect(w.ran.filter(l => l === POST)).toEqual([POST])
  const sent = JSON.parse(w.stdin[POST]!)
  expect(sent.event).toBe('COMMENT')
  expect(sent.commit_id).toBe(HEAD)
  expect(sent.comments).toEqual([
    { path: 'src/app.ts', line: 12, side: 'RIGHT', body: 'Could this number get a name, so readers know it is the retry wait?\n\n```\nconst RETRY_MS = 3000\n```' },
  ])
  expect(await texts(drawn)).toContain('✔ posted')
  expect(await drawn.find({ key: 'submit' })).toBeUndefined()
})

test('Request changes is posted only when picked; Cancel posts nothing', async ($, on) => {
  const w = world(on)
  w.answers[POST] = '{"id": 1}'
  const drawn = await openTheirs($)
  await drawn.press({ key: 'pending' })

  await drawn.press({ key: 'submit' })
  await drawn.press({ key: 'cancel' })
  expect(w.ran).not.toContain(POST)
  expect(await texts(drawn)).toContain('in review')

  await drawn.press({ key: 'submit' })
  await drawn.press({ key: 'event-REQUEST_CHANGES' })
  await drawn.press({ key: 'post' })
  expect(JSON.parse(w.stdin[POST]!).event).toBe('REQUEST_CHANGES')
})

test('when GitHub refuses the review, the drafts stay pending and the panel says why', async ($, on) => {
  const w = world(on)
  w.answers[POST] = { exitCode: 1, stderr: 'HTTP 422: line must be part of the diff' }
  const drawn = await openTheirs($)
  await drawn.press({ key: 'pending' })

  await drawn.press({ key: 'submit' })
  await drawn.press({ key: 'post' })

  expect((await texts(drawn)).join(' ')).toMatch('HTTP 422: line must be part of the diff')
  expect(await drawn.find({ key: 'post' })).toBeDefined()
})

test('a review of another PR asks once before replacing; Replace shows the new one', async ($, on) => {
  world(on)
  await startMine($)
  await review($, FINDING)

  const started = await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })
  const added = await review($, { ...FINDING, title: 'From the new PR' })
  expect(started.isError).toBe(false)
  expect(added.isError).toBe(false)

  const drawn = await pane($)
  expect((await texts(drawn)).join(' ')).toMatch('Replace the review of feature with acme/shop#7?')
  expect(String((await drawn.find({ key: 'f-1' }))?.props.label)).toMatch('Name the magic number')
  await drawn.press({ key: 'replace' })
  expect(String((await drawn.find({ key: 'f-1' }))?.props.label)).toMatch('From the new PR')
  expect(await drawn.find({ key: 'replace' })).toBeUndefined()
})

test('Keep holds on to the current review and the new findings are not kept', async ($, on) => {
  world(on)
  await startMine($)
  await review($, FINDING)
  await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })
  const drawn = await pane($)

  await drawn.press({ key: 'keep' })
  const late = await review($, { ...FINDING, title: 'Late one' })

  expect(late.isError).toBe(false)
  expect(await drawn.find({ key: 'keep' })).toBeUndefined()
  expect((await drawn.findAll({ type: 'Button' })).map(b => String(b.props.label)).join(' ')).not.toMatch('Late one')
})

test('a review with no findings yet is replaced without asking', async ($, on) => {
  world(on)
  await startMine($)

  await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })

  const shown = await paneText($)
  expect(shown).toMatch('acme/shop#7')
  expect(shown).not.toMatch('Replace the review')
})

const HEAD2 = 'b'.repeat(40)

test('Re-check on your PR: the button asks Claude, start lists what to check, outcomes and new problems show by round', async ($, on) => {
  const w = world(on)
  await startMine($)
  await review($, FINDING)
  await review($, { ...FINDING, title: 'Skip me' })
  await review($, { action: 'set-status', number: 1, status: 'fixing' })
  await review($, { action: 'set-status', number: 2, status: 'wontfix' })

  const drawn = await pane($)
  await drawn.press({ key: 'recheck' })
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]).toMatch('Re-check')
  expect(w.submitted[0]).toMatch('feature')

  const started = await review($, { action: 'start', pr: 'feature', head: HEAD2 })
  expect(started.text).toMatch('#1 src/app.ts:12 Name the magic number')
  expect(started.text).not.toMatch('Skip me')
  expect(started.text).toMatch(HEAD.slice(0, 7))
  expect(started.text.includes('\n')).toBe(false)

  expect((await review($, { action: 'outcome', number: 2, outcome: 'addressed' })).isError).toBe(true)
  expect((await review($, { action: 'outcome', number: 1, outcome: 'wrong', note: 'Still a bare number' })).isError).toBe(false)
  await review($, { ...FINDING, title: 'A regression', score: 9, weight: 'must' })

  const shown = (await texts(drawn)).join('\n')
  expect(shown).toMatch('Round 1 · 2 found')
  expect(shown).toMatch('Round 2 · ✅ 0  ⚠️ 1  ❌ 0 · 1 new')
  expect(shown).toMatch('⚠️ addressed wrongly')
  expect(shown).toMatch('New in round 2')
  const labels = (await drawn.findAll({ type: 'Button' })).map(b => String(b.props.label))
  expect(labels.findIndex(l => l.includes('A regression'))).toBeGreaterThan(labels.findIndex(l => l.includes('Skip me')))
})

test('the same head again does not open another round', async ($, on) => {
  world(on)
  await startMine($)
  const again = await review($, { action: 'start', pr: 'feature', head: HEAD })

  expect(again.text).toMatch('Round 1')
  expect(await paneText($)).not.toMatch('Round 2')
})

const OLD = 'c'.repeat(40)

/** Fakes gh: you are "me", with two thread starters and a reply on acme/shop#7, last reviewed at OLD. */
function fakeGitHub(w: World) {
  const line = (o: unknown) => JSON.stringify(o)
  w.answers['gh api user'] = 'me\n'
  w.answers['gh api repos/acme/shop/pulls/7/comments'] = [
    line({ id: 1, user: { login: 'me' }, path: 'src/app.ts', line: 12, body: 'Could 3000 get a name?' }),
    line({ id: 2, user: { login: 'author' }, in_reply_to_id: 1, path: 'src/app.ts', line: 12, body: 'Done!' }),
    line({ id: 3, user: { login: 'me' }, path: 'src/b.ts', line: 4, body: 'Is this check needed?' }),
  ].join('\n')
  w.answers['gh api repos/acme/shop/pulls/7/reviews'] = line({ user: { login: 'me' }, commit_id: OLD, submitted_at: '2026-10-01T10:00:00Z', state: 'COMMENTED' })
}

test('a message with a PR link tells Claude a re-check is possible, rule included', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.prompt.submit({ text: 'are my comments on https://github.com/acme/shop/pull/7 addressed?' } as never)
  await $.prompt.submit({ text: 'no link here' } as never)

  expect(w.contexts[0]?.join('\n')).toMatch('acme/shop#7')
  expect(w.contexts[0]?.join('\n')).toMatch(TOOL)
  expect(w.contexts[1]).toBeUndefined()
})

test('in a new session, starting their PR rebuilds the list from your GitHub comments and re-checks from your last review', async ($, on) => {
  const w = world(on)
  fakeGitHub(w)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const started = await review($, { action: 'start', pr: 'acme/shop#7', mode: 'theirs', head: HEAD })

  expect(started.text).toMatch('Round 2')
  expect(started.text).toMatch('#1 src/app.ts:12 Could 3000 get a name?')
  expect(started.text).toMatch('#2 src/b.ts:4 Is this check needed?')
  expect(started.text).toMatch(`${OLD}..HEAD`)
  expect(w.ran.some(l => l.includes('--paginate'))).toBe(true)

  await review($, { action: 'outcome', number: 1, outcome: 'addressed' })
  await review($, { action: 'outcome', number: 2, outcome: 'missed', note: 'Still there' })
  const shown = await paneText($)
  expect(shown).toMatch('Your comments')
  expect(shown).toMatch('✅ addressed')
  expect(shown).toMatch('❌ not addressed')
  expect(shown).toMatch('Round 2 · ✅ 1  ⚠️ 0  ❌ 1 · 0 new')
})

test('new problems on their PR get drafts and go through the same pending and submit flow', async ($, on) => {
  const w = world(on)
  fakeGitHub(w)
  w.answers[POST] = '{"id": 2}'
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await review($, { action: 'start', pr: 'acme/shop#7', mode: 'theirs', head: HEAD })
  await review($, { ...THEIRS, title: 'A regression' })

  const drawn = await pane($)
  await drawn.press({ key: 'f-3' })
  await drawn.press({ key: 'pending' })
  await drawn.press({ key: 'submit' })
  await drawn.press({ key: 'post' })

  const sent = JSON.parse(w.stdin[POST]!)
  expect(sent.comments).toHaveLength(1)
  expect(sent.commit_id).toBe(HEAD)
})

test('with no comments of yours on GitHub, their PR starts as a first review', async ($, on) => {
  const w = world(on)
  w.answers['gh api user'] = 'me\n'
  w.answers['gh api repos/acme/shop/pulls/7/comments'] = ''
  w.answers['gh api repos/acme/shop/pulls/7/reviews'] = ''
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const started = await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })

  expect(started.text).toMatch('Review of acme/shop#7 started')
})

test('on their PR a re-check in the same session also rebuilds from GitHub', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  w.answers['gh api user'] = 'me\n'
  await review($, { action: 'start', pr: 'acme/shop#7', head: OLD })
  await review($, THEIRS)

  fakeGitHub(w)
  const started = await review($, { action: 'start', pr: 'acme/shop#7', head: HEAD })

  expect(started.text).toMatch('#1 src/app.ts:12 Could 3000 get a name?')
  expect(await paneText($)).toMatch('Your comments')
})

const APPROVE = 'gh pr review 7 -R acme/shop --approve'

test('when every finding on their PR is posted or dropped, Approve PR shows and asks before approving', async ($, on) => {
  const w = world(on)
  w.answers[POST] = '{"id": 1}'
  w.answers[APPROVE] = ''
  const drawn = await openTheirs($)
  expect(await drawn.find({ key: 'next' })).toBeUndefined()
  await drawn.press({ key: 'back' })
  expect(await drawn.find({ key: 'next' })).toBeUndefined()

  await drawn.press({ key: 'f-1' })
  await drawn.press({ key: 'pending' })
  await drawn.press({ key: 'submit' })
  await drawn.press({ key: 'post' })
  expect(String((await drawn.find({ key: 'next' }))?.props.label)).toBe('Approve PR')

  await drawn.press({ key: 'next' })
  expect(w.ran).not.toContain(APPROVE)
  expect((await texts(drawn)).join(' ')).toMatch('Approve acme/shop#7 on GitHub?')
  await drawn.press({ key: 'confirm' })
  expect(w.ran).toContain(APPROVE)
  expect((await texts(drawn)).join(' ')).toMatch('Approved acme/shop#7.')
})

test('when every finding on your branch is fixed or won\'t fix, Create PR shows and asks first', async ($, on) => {
  const w = world(on)
  await startMine($)
  await review($, FINDING)
  await review($, { ...FINDING, title: 'Other' })
  await review($, { action: 'set-status', number: 1, status: 'fixed' })
  const drawn = await pane($)
  expect(await drawn.find({ key: 'next' })).toBeUndefined()

  await review($, { action: 'set-status', number: 2, status: 'wontfix' })
  expect(String((await drawn.find({ key: 'next' }))?.props.label)).toBe('Create PR')
  await drawn.press({ key: 'next' })
  await drawn.press({ key: 'cancel' })
  expect(w.submitted).toEqual([])

  await drawn.press({ key: 'next' })
  await drawn.press({ key: 'confirm' })
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]).toMatch('Create a GitHub PR for the branch feature')
})

test('a review with no findings suggests the next step at once', async ($, on) => {
  world(on)
  await startMine($)

  expect(await paneText($)).toMatch('Create PR')
})

const turnEnd = (agentId?: string) => ({ answer: 'Standards: 1 finding.', durationMs: 1, isAborted: false, turnId: 'turn', reason: 'end_turn', ...(agentId === undefined ? {} : { agentId }) }) as never

test('when a turn that changed the review ends, the review tab comes to the front once', async ($, on) => {
  const w = world(on)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await startMine($)
  await review($, FINDING)

  await $.turn.complete(turnEnd('sub-agent'))
  expect(w.opened.filter(o => o.focus === true)).toEqual([])
  await $.turn.complete(turnEnd())
  expect(w.opened.filter(o => o.focus === true)).toEqual([{ id: 'code-review-mod', focus: true }])

  await $.turn.complete(turnEnd())
  expect(w.opened.filter(o => o.focus === true)).toHaveLength(1)
})

const DAY = 24 * 60 * 60 * 1000

test('the review is saved under this session only, and comes back when that session resumes', async ($, on) => {
  const w = world(on)
  await startMine($)
  await review($, FINDING)

  const saved = w.store['review:s1'] as { savedAt: number; review: { findings: unknown[] } }
  expect(saved.savedAt).toBe(1_000_000)
  expect(saved.review.findings).toHaveLength(1)
  expect(Object.keys(w.store).filter(k => k.startsWith('review:'))).toEqual(['review:s1'])
})

test('a resumed session gets its review back and the panel opens', async ($, on) => {
  const first = { savedAt: 1_000_000 - DAY, review: { pr: 'feature', mode: 'mine', rounds: [{ n: 1, head: HEAD }], findings: [], skipped: [] } }
  const w = world(on, { 'review:s1': first })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect(await paneText($)).toMatch('feature')
  expect(w.opened.map(o => o.id)).toContain('code-review-mod')
})

test('another session never sees it, and saved reviews older than 7 days are deleted', async ($, on) => {
  const old = { savedAt: 1_000_000 - 8 * DAY, review: { pr: 'old', mode: 'mine', rounds: [{ n: 1, head: HEAD }], findings: [], skipped: [] } }
  const recent = { ...old, savedAt: 1_000_000 - DAY, review: { ...old.review, pr: 'recent' } }
  const w = world(on, { 'review:old': old, 'review:other': recent, 'todos:x': [] })
  w.sessionId = 's2'

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect(await paneText($)).toMatch('No review yet')
  expect(Object.keys(w.store).sort()).toEqual(['review:other', 'todos:x'])
})

test('/clear starts the next session with no review', async ($, on) => {
  world(on)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  await startMine($)
  await review($, FINDING)

  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)

  expect(await paneText($)).toMatch('No review yet')
})

/** Each Button that has a letter or digit, by its key. */
async function hotkeys(drawn: { findAll: (q: { type: 'Button' }) => Promise<{ key?: string; props: Record<string, unknown> }[]> }) {
  return Object.fromEntries((await drawn.findAll({ type: 'Button' })).filter(b => b.props.hotkey !== undefined).map(b => [b.key, b.props.hotkey]))
}

test('each button in a finding on your PR has its letter, and the detail view says so', async ($, on) => {
  world(on)
  const mine = await openMine($)

  expect(await hotkeys(mine)).toEqual({ fix: 'f', wontfix: 'w', ask: 'a' })
  expect((await texts(mine)).join(' ')).toMatch('Esc back')
})

test('each button in a finding on their PR has its letter', async ($, on) => {
  world(on)
  const theirs = await openTheirs($)

  expect(await hotkeys(theirs)).toEqual({ pending: 'p', drop: 'd', edit: 'e', rewrite: 'r' })
})

test('the first nine rows open with their digit, in the order shown', async ($, on) => {
  world(on)
  await startMine($)
  await review($, { ...FINDING, title: 'Low', score: 2 })
  await review($, { ...FINDING, title: 'High', score: 9 })
  const drawn = await pane($)

  expect(String((await drawn.find({ key: 'f-2' }))?.props.hotkey)).toBe('1')
  expect(String((await drawn.find({ key: 'f-1' }))?.props.hotkey)).toBe('2')
})
