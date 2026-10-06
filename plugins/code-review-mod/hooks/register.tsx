import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Incoming, Review, ReviewInput } from '../types'

import {
  askAbout,
  backToList,
  confirmStep,
  drop,
  openFinding,
  keepReview,
  numberRows,
  pickEvent,
  recheck,
  replaceReview,
  rewrite,
  saveEdit,
  showConfirm,
  showInput,
  showSubmit,
  submitReview,
  switchMode,
  togglePending,
  toggleQueued,
  wontFix,
} from './actions'
import { KEEP_MS, PANE, PANE_TITLE, RULE, SAVED, TOOL, recheckNote } from './config'
import { prLinks } from './mode'
import type { Ports } from './ports'
import { TOOL_SPEC, runTool } from './review-tool'
import { drawConfirmPane } from './ui/confirm-pane'
import { drawFindingPane } from './ui/finding-pane'
import { drawListPane } from './ui/list-pane'
import { drawSubmitPane } from './ui/submit-pane'
import { toolRowLine } from './ui/rows'
import { drawEmptyResult, drawToolRow } from './ui/tool-row'

const review = atom({ plugin: 'code-review-mod', key: 'review' } as const, null)
const incoming = atom({ plugin: 'code-review-mod', key: 'incoming' } as const, null)
const view = atom({ plugin: 'code-review-mod', key: 'view' } as const, { kind: 'list' })
const shouldFocus = atom({ plugin: 'code-review-mod', key: 'shouldFocus' } as const, false)
const isReviewing = atom({ plugin: 'code-review-mod', key: 'isReviewing' } as const, false)
const notice = atom({ plugin: 'code-review-mod', key: 'notice' } as const, '')
const diff = atom({ plugin: 'code-review-mod', key: 'diff' } as const, null)

type $ = EngineInterface

/** A review saved for `claude --resume`, with the one waiting for "Replace?" if any. */
type Saved = { savedAt: number; review: Review | null; incoming?: Incoming | null }

function isSaved(value: unknown): value is Saved {
  return typeof value === 'object' && value !== null && 'savedAt' in value && typeof value.savedAt === 'number' && 'review' in value
}

/** Saves the review, and the one waiting for "Replace?", under this session's id. */
async function save($: $) {
  const saved: Saved = { savedAt: await $.clock.now(), review: await read($, review), incoming: await read($, incoming) }
  await $.store.set(`${SAVED}${await $.session.id()}`, saved)
}

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
    review: {
      get: () => read($, review),
      // Every change is saved under this session's id, so `claude --resume` brings it back.
      update: async change => {
        const changed = await update($, review, change)
        await save($)
        return changed
      },
    },
    incoming: {
      get: () => read($, incoming),
      update: async change => {
        const changed = await update($, incoming, change)
        await save($)
        return changed
      },
    },
    view: { get: () => read($, view), update: change => update($, view, change) },
    shouldFocus: { get: () => read($, shouldFocus), update: change => update($, shouldFocus, change) },
    isReviewing: { get: () => read($, isReviewing), update: change => update($, isReviewing, change) },
    notice: { get: () => read($, notice), update: change => update($, notice, change) },
    diff: { get: () => read($, diff), update: change => update($, diff, change) },
  }
}

/** Deletes saved reviews older than a week, and brings back this session's own after a resume. */
async function restore($: $) {
  const now = await $.clock.now()
  const id = await $.session.id()
  for (const key of (await $.store.keys()).filter(k => k.startsWith(SAVED))) {
    const saved = await $.store.get(key)
    if (!isSaved(saved) || now - saved.savedAt > KEEP_MS) {
      await $.store.delete(key)
    } else if (key === `${SAVED}${id}` && (await read($, review)) === null) {
      await update($, review, () => saved.review)
      await update($, incoming, () => saved.incoming ?? null)
      await ports($).openPane()
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register(TOOL_SPEC)
    await restore($)

    return started
  })

  // The loader reads hook filters from this file only: keep this name written out, not SKILL from config.
  on('skill.prompt', { skill: 'mattpocock-skills:code-review' }, async ($, e, next) => {
    const prompted = await next(e)
    await update($, isReviewing, () => true)
    await ports($).openPane()

    return { text: `${prompted.text}\n\n${RULE}` }
  })

  // Written out for the loader, like the skill name above: this is TOOL.
  on('tool.call', { tool: 'mcp__code-review-mod__review' }, async ($, e) => {
    const answer = await runTool(ports($), e as ReviewInput)

    return answer.isError ? { result: answer.text, isError: true as const } : { result: answer.text }
  })

  // When the main turn ends the review is done; if it changed the list, its tab comes to the front.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && (await read($, isReviewing))) {
      await update($, isReviewing, () => false)
      await numberRows(ports($))
    }
    if (e.agentId === undefined && (await read($, shouldFocus))) {
      await update($, shouldFocus, () => false)
      await ports($).openPane({ focus: true })
    }

    return done
  })

  // A message with a PR link may ask for a re-check: tell Claude how, rule included.
  on('prompt.submit', async ($, e, next) => {
    const prs = prLinks(e.text)
    if (prs.length === 0) {
      return next(e)
    }

    return next({ ...e, context: [...(e.context ?? []), recheckNote(prs)] })
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if ((await read($, review)) === null) {
      return composed
    }

    return { sections: [...composed.sections, { id: 'code-review-mod:rule', text: RULE, scope: 'session' }] }
  })

  // /clear starts a new session: one review per session, so the panel starts empty.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, review, () => null)
      await update($, incoming, () => null)
      await update($, view, () => ({ kind: 'list' }))
    }

    return next(e)
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
    const waiting = await read($, incoming)
    const finding = shown.kind === 'finding' ? current?.findings.find(f => f.n === shown.n) : undefined
    if (current !== null && finding !== undefined && shown.kind === 'finding') {
      const n = finding.n
      return drawFindingPane(parts, { finding, mode: current.mode, view: shown, notice: await read($, notice), columns }, {
        back: () => backToList(ports($)),
        toggleQueued: () => toggleQueued(ports($), n),
        wontFix: () => wontFix(ports($), n),
        ask: () => askAbout(ports($), n),
        drop: () => drop(ports($), n),
        togglePending: () => togglePending(ports($), n),
        edit: () => showInput(ports($), n, 'edit'),
        saveEdit: text => saveEdit(ports($), n, text),
        rewrite: () => showInput(ports($), n, 'rewrite'),
        sendRewrite: note => rewrite(ports($), n, note),
      })
    }

    if (current !== null && shown.kind === 'submit') {
      return drawSubmitPane(parts, current, shown.event, await read($, notice), {
        pick: event => pickEvent(ports($), event),
        post: () => submitReview(ports($)),
        cancel: () => backToList(ports($)),
      })
    }

    if (current !== null && shown.kind === 'confirm') {
      const queued = current.findings.filter(f => f.status === 'queued').length
      return drawConfirmPane(parts, shown.step, current.pr, queued, { confirm: () => confirmStep(ports($)), cancel: () => backToList(ports($)) })
    }

    return drawListPane(
      parts,
      {
        review: current,
        asking: waiting?.answer === 'ask' ? waiting.review.pr : null,
        notice: await read($, notice),
        isReviewing: await read($, isReviewing),
        columns,
      },
      {
        open: n => openFinding(ports($), n),
        flipMode: () => switchMode(ports($)),
        submit: () => showSubmit(ports($)),
        replace: () => replaceReview(ports($)),
        keep: () => keepReview(ports($)),
        recheck: () => recheck(ports($)),
        next: step => showConfirm(ports($), step),
      },
    )
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
