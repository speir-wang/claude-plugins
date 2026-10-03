# Spec: code-review-mod

Status: ready for work · Written: 2026-10-03 · Plugin: code-review-mod (new)

## Problem Statement

`/mattpocock-skills:code-review` finds the right things, but the way it shows them is hard to work with.

- The review arrives as one long message. It scrolls away as soon as the conversation moves on.
- It names a problem but doesn't show the code as it is now, or what better code would look like. I have to ask Claude for that before I can judge if a finding is worth fixing.
- Nothing says how much a finding matters. "Possible Feature Envy" looks as urgent as a broken spec requirement.
- I use the skill for two different jobs. On my own branch, I want to work through the findings and fix them. On someone else's PR, I want to turn them into review comments. The skill treats both the same.
- When the author says "addressed", I ask Claude to check, often in a new session and without naming the skill. Nothing connects that check to my earlier comments. Nothing looks for new problems in the commits added since.

## Solution

A new mod, `code-review-mod`, in this marketplace, next to todo-commits. It adds a panel that holds one review for one PR, for the length of one Claude Code session.

- When the code-review skill runs, the panel opens on its own. Claude records each finding in it, not in a long chat message. The chat gets only the skill's one-line summary.
- Findings sit in two groups, **Standards** and **Spec**, never mixed. Inside each group they are sorted by a **1–10 score** for how much they're worth fixing. Each one also shows **must fix** or **maybe**.
- Opening a finding shows the score, the file and line, the code now, the suggested code, and why it matters.
- **Mode** depends on how the review started. A PR link means it's someone else's PR. No link, on your own branch, means it's yours. You can flip the mode in the panel.
  - **Your PR:** each finding can be fixed (it becomes a todo in todo-commits, so it gets its own commit), skipped as won't fix, or asked about.
  - **Their PR:** each finding carries a comment draft. That draft is exactly what goes on GitHub. You add drafts to a pending review, then submit them all at once as one GitHub review.
- **Re-check.** Ask in plain words, or press a button. Each finding you acted on gets ✅ addressed, ⚠️ addressed wrongly, or ❌ not addressed. Then every commit since the last review gets a full review, and any new problems show in their own list. On their PR, the re-check rebuilds the list from your own comments on GitHub, so it works in a brand-new session. Nothing is saved locally.
- When nothing is left to do, the panel suggests the next step: **Approve PR** on theirs, **Create PR** on your branch if it isn't on GitHub yet.

## User Stories

### Starting a review

1. As a developer, I want the panel to open by itself when the code-review skill finishes, so that I see the findings without doing anything.
2. As a developer, I want it to react only to `mattpocock-skills:code-review`, not the built-in `/code-review`, so that every finding has the same shape.
3. As a developer, I want the chat to show only the skill's one-line summary (count and worst finding per group), so that the conversation isn't buried under a long report.
4. As a developer, I want that one-line summary to stay in the chat, so that I still know what happened if the panel is closed.
5. As a developer, I want a review started with a PR link to open in "their PR" mode, so that I don't have to say whose PR it is.
6. As a developer, I want a review started on my branch with no link to open in "my PR" mode, so that reviewing my own work needs no extra words.
7. As a developer, I want to flip the mode in the panel, so that odd cases (a PR I took over) still work.
8. As a developer, I want to review a PR from a repo other than the one I'm in, so that a pasted link always works.
9. As a developer, I want the panel to ask once before replacing the current review with a review of a different PR, so that I never lose work by accident.
10. As a developer, I want the skill to keep running whatever I answer to that question, so that the question only decides what the panel keeps.

### Reading findings

11. As a developer, I want findings in two groups, Standards and Spec, so that one kind of problem never hides the other.
12. As a developer, I want each finding to have a 1–10 score, so that I can tell at a glance how much it's worth fixing.
13. As a developer, I want the score to mean the same thing every time (9–10 a bug or broken spec, 6–8 fix before merge, 3–5 nice to have, 1–2 nitpick), so that I can trust it.
14. As a developer, I want findings sorted by score inside each group, so that the most important ones come first.
15. As a developer, I want findings scored 1–2 greyed out but still shown, so that nothing is hidden while my idea of "worth it" keeps changing.
16. As a developer, I want each finding marked "must fix" (a broken written rule) or "maybe" (a judgement call), so that a code smell doesn't look as urgent as a broken rule.
17. As a developer, I want each row to show its score, marker, file and line, and a short title, so that I can scan the list without opening anything.
18. As a developer, I want a finding's detail to show the code as it is now, with diff colours, so that I don't have to ask Claude for it.
19. As a developer, I want a finding's detail to show the suggested code, so that I can judge whether the fix is worth it.
20. As a developer, I want a "Why it matters" section written for me, explaining why this was picked, so that I understand the problem before I decide.
21. As a developer, I want the code shown before the explanation, so that I judge from the code first.
22. As a developer, I want all of this written when the review finishes, not when I open a finding, so that opening a finding is instant.
23. As a developer, I want a group with no findings to say "nothing found", so that I know it ran.
24. As a developer, I want the Spec group to say "skipped, no spec found" when there was no spec, so that a missing review isn't mistaken for a clean one.
25. As a developer, I want the panel's top row to show the counts (open, pending, done), so that I see progress in the panel rather than in my busy status line.
26. As a developer, I want a one-line tip at the bottom of the panel, like the todo panel has, that changes with the mode, so that I remember what I can say or press.
27. As a developer, I want the tip to remind me that a review is one per session, so that I don't mix PRs in one session.

### My own PR

28. As a developer, I want "Fix it" on a finding to add a todo in todo-commits, so that each fix gets its own commit.
29. As a developer, I want "Fix it" to ask Claude to fix the finding right away when todo-commits isn't installed, so that the button still works.
30. As a developer, I want to say "fix 3" in chat as well as press the button, so that I can work from the keyboard.
31. As a developer, I want "Won't fix" on a finding, so that I can close it without changing code.
32. As a developer, I want "Ask Claude" on a finding, so that I can ask about it without copying it into the chat.
33. As a developer, I want each finding's status (open, fixing, fixed, won't fix) shown in its row, so that I know what's left.

### Their PR

34. As a reviewer, I want each finding to come with a comment draft, so that I don't write comments from scratch.
35. As a reviewer, I want the draft to be short, polite and asked as a question, with suggested code when there is some, so that comments are easy for the author to accept.
36. As a reviewer, I want the draft to leave out the score and the Standards/Spec label, so that the author sees only what helps them.
37. As a reviewer, I want the draft I see to be exactly what gets posted, so that nothing changes behind my back.
38. As a reviewer, I want the draft shown under "Why it matters", in its own block, so that I can tell my explanation apart from the author's comment.
39. As a reviewer, I want "Add to review" to put a draft in a pending pile and not post it, so that I can build up a review before anything goes public.
40. As a reviewer, I want "Remove from review" on a pending draft, so that I can change my mind before submitting.
41. As a reviewer, I want "Drop" on a finding, so that I can skip ones I don't want to raise.
42. As a reviewer, I want to edit a draft directly in a text box, so that I can fix a word.
43. As a reviewer, I want "Rewrite" with a short note ("softer", "drop the code"), so that Claude can change the draft's tone or content.
44. As a reviewer, I want the top row to show "N pending · Submit review", so that I always know what's waiting.
45. As a reviewer, I want "Submit review" to post all pending drafts as one GitHub review, each on its line, so that the author gets one notification and the comments sit next to the code.
46. As a reviewer, I want to pick Comment, Request changes or Approve when I submit, with Comment selected by default, so that a strong signal is always on purpose.
47. As a reviewer, I want to confirm before anything is posted, so that nothing goes public by accident.

### Re-check

48. As a reviewer, I want to ask "are my comments addressed?" in plain words with a PR link, without naming the skill, so that re-checking feels natural.
49. As a reviewer, I want that to work in a new session, so that I don't have to find and resume an old one.
50. As a reviewer, I want the re-check to rebuild the list from my own comments on GitHub, so that nothing needs to be saved locally.
51. As a reviewer, I want only comments that start a thread to count, not my replies, so that each finding appears once.
52. As a reviewer, I want threads marked resolved still checked, so that "resolved" without a real fix is caught.
53. As a reviewer, I want the re-check to start from the commit my last review was made on, so that "since the last review" is exact.
54. As a developer, I want a "Re-check" button in the panel, so that I can start one without typing.
55. As a developer, I want each finding I acted on (posted on theirs, "fix it" on mine) to get ✅ addressed, ⚠️ addressed wrongly, or ❌ not addressed, so that I know what's left.
56. As a developer, I want findings I dropped or marked won't fix left out of the re-check, so that I'm not asked about them again.
57. As a developer, I want every commit since the last review fully reviewed, so that regressions in other areas are caught too.
58. As a developer, I want new problems from a re-check listed separately from the old findings, so that I can tell old from new.
59. As a reviewer, I want new problems on their PR to get scores and comment drafts, and go through the same pending/submit flow, so that regressions are easy to raise.
60. As a developer, I want the top of the panel to show rounds (round 1 with its findings, round 2 with its ✅/⚠️/❌ counts and new problems), so that I can see progress across re-checks.

### Next step

61. As a reviewer, I want an "Approve PR" suggestion when every finding on their PR is submitted or dropped, or there were none, so that I finish the review in one step.
62. As a developer, I want a "Create PR" suggestion when every finding on my branch is fixed or won't fix, or there were none, and the branch isn't on GitHub yet, so that I move on in one step.
63. As a developer, I want both suggestions to ask me to confirm, so that public GitHub actions are never one accidental key press.

### Living with the todo panel

64. As a developer, I want the review panel and the todo panel open at the same time, as tabs, so that I never close one to use the other.
65. As a developer, I want the tab that just changed to come to the front by itself (a review or re-check finishes → review tab; Claude starts a todo → todo tab), so that I never switch tabs by hand.
66. As a developer, I want the two mods to work without knowing about each other, except for "Fix it" adding a todo, so that each one installs on its own.

### Lifetime

67. As a developer, I want the review to last only for the current session, so that each review stays tied to one PR and one session.
68. As a developer, I want the review to come back when I resume that session, so that a pause doesn't lose it.
69. As a developer, I want nothing about past reviews saved across sessions, so that there's no history to manage.

## Implementation Decisions

**Plugin and name.** A new plugin `code-review-mod` in this marketplace. It gets an entry in the marketplace list, in the release-please packages, and in the release manifest, the same way todo-commits does. Its structure follows the split todo-commits uses: `$`, state atoms and hook filters stay in the entry file. The other modules get only plain data and the single abilities they need (run a command, ask the model).

**What starts it.** A hook on the skill starting watches for `mattpocock-skills:code-review` only. When it fires, the mod opens the panel and adds a rule to Claude's instructions for this session. The rule says to record every finding with the mod's own tool, and to put only the skill's one-line summary in the chat. This follows the todo-commits lesson: give Claude a tool the mod owns, and name that tool in the rule.

**The mod's own tool.** One tool that Claude calls, with actions:

- `start`: the PR (`owner/repo#number`, or the branch name when there's no PR), the mode, and the head commit reviewed.
- `add`: one finding. Its group (Standards/Spec), must fix or maybe, score, file, line, short title, code now, suggested code, why it matters, and on their PR the comment draft.
- `skipped`: a group that didn't run, with the reason (for example, no spec).
- `outcome`: a re-check result for one finding (addressed / addressed wrongly / not addressed).
- `set-status`: the status of one finding.

Each call answers in one line. Its rows in the chat shrink to one line, like the todo tool's rows. Claude writes the score, both code blocks, the explanation and the draft when it records a finding, after the skill's sub-agents report back. The mod never reads inside the sub-agents.

**Score scale.** 9–10 a bug or broken spec · 6–8 fix before merging · 3–5 nice to have · 1–2 nitpick. This scale goes into the rule, so every score means the same thing. Sorting happens only inside a group, never across groups. The skill keeps the two groups apart on purpose.

**Mode.** Set by the `start` action: a PR link means theirs; no link, on your own branch, means yours. A switch in the panel flips it.

**Comment drafts.** Short, polite, asked as a question, with suggested code when there is some. No score, no group label. The panel shows the exact text that will be posted. Edit changes it directly. Rewrite sends Claude the draft plus your note and replaces the draft with Claude's answer.

**Posting.** Pending drafts are held in the session, not on GitHub. "Submit review" asks you to confirm and pick Comment / Request changes / Approve (Comment by default). Then it posts one GitHub review with each comment on its line, through `gh`.

**Re-check on their PR.** When your message holds a GitHub PR link, a hook on prompt submit adds a short note for Claude: a re-check is possible for this PR. The mod reads your review comments on that PR through `gh`. Only thread-starting comments count; replies don't. Resolved threads count. It rebuilds one finding per comment, marked posted. The starting point is the commit of your latest review. Claude then records an outcome for each comment, reviews every commit since that starting point, and records new problems as a new round. This is the only re-check path for their PR, even in a resumed session.

**Re-check on your PR.** It happens in the session where you're working. It uses the findings kept there and the head commit from the last round.

**Lifetime.** Review state lives in the session's state only. Nothing goes to the cross-session store. One review per session. Starting a review of a different PR asks before replacing.

**Fix it.** If todo-commits is installed, Fix it adds a todo naming the finding, through todo-commits' tool. Otherwise it sends Claude a prompt to fix that one finding.

**UI.** Only the panel. No status line entry, no band, no toast.

- **Top row:** PR, mode switch, counts, pending/submit, rounds.
- **Body:** two groups, rows sorted by score, 1–2 greyed out.
- **Detail view:** ← Back and Esc, like todo-commits.
- **Bottom:** a tip line that changes with the mode.
- **Next step:** Approve PR / Create PR, shown when nothing is left. Each asks you to confirm.

**Tabs.** When a review or re-check finishes, the mod opens its own panel again so its tab comes to the front. It doesn't need to know about the todo panel.

**Experiments (try first, keep only if we like it):**
- Keys in the panel: ↑/↓ move, Enter opens, Esc goes back, and one letter per button (f fix, w won't fix, a ask, p add to review, d drop, e edit, r rewrite).
- Each mod bringing its own tab to the front when it changes.

**Facts to test before building on them:**
- Does the skill-start hook fire when you type the slash command yourself, or only when Claude calls the skill?
- Does opening a panel that's already open bring its tab to the front?
- Does session state come back on `claude --resume`?
- How can the mod tell todo-commits is installed?

## Testing Decisions

- **A good test uses the mod the way a person would and checks what they'd see.** It doesn't check how the mod is built inside.
- **Main seam: the whole mod in the `claude-code/testing` engine.** This is the prior art in todo-commits' main test file. Tests feed in events: the skill starting, tool calls, a message holding a PR link. They fake `gh` and `git` output, draw the panel, press its buttons, and check rows, counts, the tip, prompts sent to Claude, and the `gh` commands run. This covers every user story above.
- **Small direct tests only for four rules with many cases.** Prior art is todo-commits' list and model tests.
  - The re-check outcome per finding, plus the list of new problems.
  - Rebuilding findings from GitHub comments: thread starters vs replies, resolved threads, the starting commit.
  - The mode: link vs no link, flipped by hand.
  - Sort order: by score inside each group, 1–2 greyed out, groups never mixed.
- **No other inside tests,** so moving code around rarely breaks a test.
- Run `claude plugin validate` and `claude plugin test` on the mod.

## Out of Scope

- The built-in `/code-review` skill.
- Changing the code-review skill itself. The mod builds on top of its output.
- Any review history across sessions, or a list of past PRs.
- A status line entry, band or toast.
- Showing two panels side by side. Claude Code shows one panel at a time, with the rest as tabs.
- Hiding findings below a score.
- The grill-me panel from the same ideas doc. That's a separate plugin.

## Further Notes

- The idea started in the "Skill panel plugin ideas" doc.
- Name: `code-review-mod`, not `code-review-panel`, because the panel may not be the only UI it ever uses.
- Posting a review, approving a PR and creating a PR all act publicly on GitHub. Each needs your confirmation.
- Commits for this plugin use the scope `code-review-mod`. Its version starts in the release manifest. Never edit it by hand.
