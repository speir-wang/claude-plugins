import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ReviewInput } from '../types'

import { askAbout, backToList, fixIt, openFinding, switchMode, wontFix } from './actions'
import { PANE, PANE_TITLE, RULE, TOOL } from './config'
import type { Ports } from './ports'
import { TOOL_SPEC, runTool } from './review-tool'
import { drawFindingPane } from './ui/finding-pane'
import { drawListPane } from './ui/list-pane'
import { toolRowLine } from './ui/rows'
import { drawEmptyResult, drawToolRow } from './ui/tool-row'

const review = atom({ plugin: 'code-review-mod', key: 'review' } as const, null)
const incoming = atom({ plugin: 'code-review-mod', key: 'incoming' } as const, null)
const view = atom({ plugin: 'code-review-mod', key: 'view' } as const, { kind: 'list' })
const isChanged = atom({ plugin: 'code-review-mod', key: 'isChanged' } as const, false)
const notice = atom({ plugin: 'code-review-mod', key: 'notice' } as const, '')

type $ = EngineInterface

/** The engine's calls the other modules use, built for one event (see Ports). */
function ports($: $): Ports {
  return {
    run: async (argv, stdin) => $.process.run(argv, stdin === undefined ? undefined : { stdin }),
    openPane: async options => {
      await $.ui.open({ id: PANE, title: PANE_TITLE, ...options })
    },
    complete: request => $.model.complete(request),
    submit: async text => {
      await $.prompt.submit({ text })
    },
    fill: async text => {
      await $.prompt.fill({ text })
    },
    toolNames: async () => (await $.tool.list()).map(tool => tool.name),
    callTool: async (tool, input) => {
      const ran = (await $.tool.call({ tool, ...input } as never)) as { result?: unknown; isError?: boolean }
      return ran.isError === true || ran.result === undefined ? undefined : String(ran.result)
    },
    review: { get: () => read($, review), update: change => update($, review, change) },
    incoming: { get: () => read($, incoming), update: change => update($, incoming, change) },
    view: { get: () => read($, view), update: change => update($, view, change) },
    isChanged: { get: () => read($, isChanged), update: change => update($, isChanged, change) },
    notice: { get: () => read($, notice), update: change => update($, notice, change) },
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register(TOOL_SPEC)

    return started
  })

  // The loader reads hook filters from this file only: keep this name written out, not SKILL from config.
  on('skill.prompt', { skill: 'mattpocock-skills:code-review' }, async ($, e, next) => {
    const prompted = await next(e)
    await ports($).openPane()

    return { text: `${prompted.text}\n\n${RULE}` }
  })

  // Written out for the loader, like the skill name above: this is TOOL.
  on('tool.call', { tool: 'mcp__code-review-mod__review' }, async ($, e) => {
    const answer = await runTool(ports($), e as ReviewInput)

    return answer.isError ? { result: answer.text, isError: true as const } : { result: answer.text }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if ((await read($, review)) === null) {
      return composed
    }

    return { sections: [...composed.sections, { id: 'code-review-mod:rule', text: RULE, scope: 'session' }] }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id !== PANE) {
      return next(e)
    }
    // Esc or the close mark on a finding goes back to the list instead of closing.
    if (e.origin.kind === 'person' && (await read($, view)).kind !== 'list') {
      await backToList(ports($))
      return { value: undefined }
    }
    await update($, view, () => ({ kind: 'list' }))

    return next(e)
  })

  // Written out for the loader: this is PANE.
  on('ui.render', { component: 'Pane', requestId: 'code-review-mod' }, async ($, e) => {
    const parts = $.ui.resolve(e)
    const columns = e.props.bodyColumns ?? 60
    const shown = await read($, view)
    const current = await read($, review)
    const finding = shown.kind === 'finding' ? current?.findings.find(f => f.n === shown.n) : undefined
    if (current !== null && finding !== undefined) {
      const n = finding.n
      return drawFindingPane(parts, finding, current.mode, columns, {
        back: () => backToList(ports($)),
        fix: () => fixIt(ports($), n),
        wontFix: () => wontFix(ports($), n),
        ask: () => askAbout(ports($), n),
      })
    }

    return drawListPane(parts, { review: current, columns }, { open: n => openFinding(ports($), n), flipMode: () => switchMode(ports($)) })
  })

  // The review tool's calls draw as one line; the panel shows the review itself.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, input, isErrored, isInterrupted } = e.props
    if (tool !== TOOL || isErrored || isInterrupted) {
      return next(e)
    }

    return drawToolRow($.ui.resolve(e), toolRowLine((input ?? {}) as ReviewInput))
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isErrored) {
      return next(e)
    }

    return drawEmptyResult($.ui.resolve(e))
  })
}
