export const PANE = 'code-review-mod'
export const PANE_TITLE = 'Review'

/** The only skill the mod reacts to; the built-in /code-review has another shape. */
export const SKILL = 'mattpocock-skills:code-review'

export const TOOL_NAME = 'review'
export const TOOL = `mcp__code-review-mod__${TOOL_NAME}`

/** Where a session's review is saved for `claude --resume`: this, then the session id. */
export const SAVED = 'review:'

/** Saved reviews older than this are deleted when a session starts. */
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000

/** The one-line tip at the bottom of the panel, by mode. */
export const TIPS = {
  mine: 'Tip: "fix 3" adds #3 to the fix list · Fix all fixes the list in one commit · then "re-check" · one review per session',
  theirs: 'Tip: press a row to add its comment · Submit posts them as one review · one review per session',
} as const

/** The key hint at the bottom of a finding, by mode. ↑/↓ and Enter are the panel's own. */
export const KEYS = {
  mine: 'Keys: f add to fix list · w won\'t fix · a ask · x delete · Esc back',
  theirs: 'Keys: p add to review · d drop · e edit · r rewrite · x delete · Esc back',
} as const

/** What goes in each level, highest first. Claude picks the first one that fits. */
export const LEVELS = [
  '"xhigh": wrong output, a crash, data loss or a security hole on a path normal use reaches; or a spec requirement that is not met. Example: the retry loop never stops when the server returns 503.',
  '"high": a written rule (AGENTS.md, CLAUDE.md, a style guide) is broken; a bug that needs unusual input or state; or a change whose effect reaches past what the PR is about and that the PR does not mention (scope creep). Example: a PR about the login form changes a shared Button default.',
  '"medium": nothing goes wrong now, but the code is harder to read, change or test: duplication, unclear names, no test for new behaviour. Example: the same date parsing copied in three files.',
  '"low": style, formatting, or a preference no written rule backs. Example: trailing commas, import order.',
] as const

/** How to tell scope creep, for the "high" level. */
export const SCOPE_CREEP =
  'Scope creep is a change to something used outside the PR\'s area (shared components and utilities, lint, tsconfig, build or CI config, environment defaults, dependency versions, database schema, anything imported from many places) that the PR title, description and commit messages do not mention. If they mention it, it was on purpose: judge it like any other change. If it breaks something on a path normal use reaches, it is "xhigh". Its "scenario" names one place outside the PR\'s area that is affected.'

export const RULE = [
  `The user has a review panel. It only shows what you record with the ${TOOL} tool. Only for the ${SKILL} skill and re-checks of its review (never for the built-in /code-review), follow these rules:`,
  `- When a review starts, call ${TOOL} "start" with "pr" (owner/repo#number when the user gave a PR link, else the branch name), "mode" ("theirs" when the user gave a PR link, "mine" for their own branch) and "head" (the full commit hash reviewed).`,
  `- After the reviewers report back, check each finding before you record it: read the code at its file and line, its callers and its tests, and try to show the finding is wrong. Record it only if it holds up.`,
  `- Record every finding that holds up with ${TOOL} "add", one call per finding: group ("standards" or "spec"), level, file, line, title (short), now (the code as it is now), suggested (better code, or "" when there is none), why (why it matters, written for the user), scenario, evidence and confidence.`,
  '- Pick the level from the first of these that fits, top to bottom:',
  ...LEVELS.map(level => `  - ${level}`),
  `- ${SCOPE_CREEP}`,
  '- "scenario": what goes wrong, as the inputs and state and the wrong result. "evidence": the code you read to check it, as file:line ranges. Both are needed for "high" and "xhigh"; if you can\'t give them, the level is "medium" at most, or check again.',
  '- "confidence": "confirmed" when you traced the scenario through the code, "likely" when it can\'t be traced from the repo alone (for example it depends on runtime config). Needed for "high" and "xhigh".',
  '- On a PR that is not the user\'s ("theirs"), also give "comment": the comment to post for the author. Short, polite, asked as a question. No level and no Standards/Spec label. Leave out the code: the panel adds the suggested code below it.',
  `- When a group did not run, call ${TOOL} "skipped" with the group and the reason (for example "no spec found").`,
  '- In the chat, write only the skill\'s one-line summary: the count and the worst finding per group. Do not repeat the findings.',
  `- On their own PR, "fix 3" means: put #3 on the fix list with ${TOOL} "set-status" (number 3, status "queued"). Don't fix it yet: the user fixes the whole list at once with the panel's Fix all. "won't fix 3" is status "wontfix".`,
  `- On a PR that is not the user's, "add 3 to the review" is ${TOOL} "set-status" with status "pending", and "drop 3" is status "dropped". Nothing is posted until the user presses Submit review.`,
  `- When the user asks to remove or delete a finding, call ${TOOL} "remove" with its number. When they ask to change one (its level, title, code, why, scenario or comment), call "edit" with the number and only the fields that change. A new level of "high" or "xhigh" needs a scenario and evidence, as for "add".`,
  `- Numbers change when a review round ends. Before you act on a number from an earlier turn, call ${TOOL} "list" to see the current numbers.`,
  `- When you fix findings, call "set-status" with status "fixing" as you start and "fixed" when done. Make one commit for the fixes together, with a normal message about the change that does not mention a review.`,
  `- To re-check: call ${TOOL} "start" again with the same pr and the new head. Its answer lists the findings to check and the commit to review from. Record each one with "outcome" (number, outcome "addressed", "wrong" or "missed", note). Then run the code review on every commit since that commit, and record new problems with "add" as usual.`,
].join('\n')

/**
 * The note added to a message that links a GitHub PR, so a plain "are my
 * comments addressed?" works in any session. It carries no rule for recording
 * findings: a built-in /code-review with a link must not pick that up.
 */
export function recheckNote(prs: string[]): string {
  return [
    `The user's message links ${prs.join(', ')}. If they ask whether their review comments there were addressed, re-check it with the review panel:`,
    `call ${TOOL} "start" with that pr, mode "theirs" and the PR's head commit (gh pr view <number> -R <owner/repo> --json headRefOid).`,
    'It rebuilds the review from their own GitHub comments and answers with what to check.',
    'Otherwise ignore this note.',
  ].join('\n')
}
