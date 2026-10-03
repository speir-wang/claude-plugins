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
  mine: 'Keys: f add to fix list · w won\'t fix · a ask · Esc back',
  theirs: 'Keys: p add to review · d drop · e edit · r rewrite · Esc back',
} as const

export const SCORE_SCALE = '9-10 a bug or a broken spec; 6-8 fix before merging; 3-5 nice to have; 1-2 nitpick'

export const RULE = [
  `The user has a review panel. It only shows what you record with the ${TOOL} tool, so follow these rules for code reviews:`,
  `- When a review starts, call ${TOOL} "start" with "pr" (owner/repo#number when the user gave a PR link, else the branch name), "mode" ("theirs" when the user gave a PR link, "mine" for their own branch) and "head" (the full commit hash reviewed).`,
  `- After the reviewers report back, record every finding with ${TOOL} "add", one call per finding: group ("standards" or "spec"), weight ("must" when a written rule or the spec is broken, "maybe" for a judgement call), score, file, line, title (short), now (the code as it is now), suggested (better code, or "" when there is none) and why (why it matters, written for the user).`,
  `- Score each finding 1-10 on how much it is worth fixing: ${SCORE_SCALE}.`,
  '- On a PR that is not the user\'s ("theirs"), also give "comment": the comment to post for the author. Short, polite, asked as a question. No score and no Standards/Spec label. Leave out the code: the panel adds the suggested code below it.',
  `- When a group did not run, call ${TOOL} "skipped" with the group and the reason (for example "no spec found").`,
  '- In the chat, write only the skill\'s one-line summary: the count and the worst finding per group. Do not repeat the findings.',
  `- On their own PR, "fix 3" means: put #3 on the fix list with ${TOOL} "set-status" (number 3, status "queued"). Don't fix it yet: the user fixes the whole list at once with the panel's Fix all. "won't fix 3" is status "wontfix".`,
  `- When you fix findings, call "set-status" with status "fixing" as you start and "fixed" when done. Make one commit for the fixes together, with a normal message about the change that does not mention a review.`,
  `- To re-check: call ${TOOL} "start" again with the same pr and the new head. Its answer lists the findings to check and the commit to review from. Record each one with "outcome" (number, outcome "addressed", "wrong" or "missed", note). Then run the code review on every commit since that commit, and record new problems with "add" as usual.`,
].join('\n')

/** The note added to a message that links a GitHub PR, so a plain "are my comments addressed?" works in any session. */
export function recheckNote(prs: string[]): string {
  return [
    `The user's message links ${prs.join(', ')}. If they ask whether their review comments there were addressed, re-check it with the review panel:`,
    `call ${TOOL} "start" with that pr, mode "theirs" and the PR's head commit (gh pr view <number> -R <owner/repo> --json headRefOid).`,
    'It rebuilds the review from their own GitHub comments and answers with what to check.',
    '',
    RULE,
  ].join('\n')
}
