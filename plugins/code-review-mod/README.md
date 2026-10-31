# code-review-mod

A review panel for the `mattpocock-skills:code-review` skill. The findings land in the panel, not in one long chat message. Each one has a level, the code as it is now, the suggested code, and why it matters.

```
feature  your PR ⇄
2 open · 1 pending · 1 done                       [ Re-check ]

Standards
#1  xhigh   api.ts:40  Retry loop never stops  fixing
#2  medium  app.ts:12  Name the magic number
#3  low     app.ts:30  Trailing comma  won't fix
Spec
#4  xhigh?  cart.ts:7  Discount ignores the cap

Tip: "fix 3" adds #3 to the fix list · Fix all fixes the list in one commit · then "re-check" · one review per session
```

## Install

```
/plugin marketplace add speir-wang/claude-plugins
/plugin install code-review-mod@he-wang
```

Restart Claude Code after installing. It works on top of the `mattpocock-skills` plugin's code-review skill.

## Use it

1. Run the code-review skill. The panel opens by itself. The chat gets only the skill's one-line summary.
2. Findings sit in two groups, **Standards** and **Spec**, sorted by level: **xhigh**, **high**, **medium**, **low**. **low** is greyed out. A **?** after the level means Claude couldn't trace the failure from the repo alone, for example because it depends on runtime config. See [Levels](#levels).
3. Rows are numbered #1, #2, … from top to bottom once the review ends. Say *"fix 3"* for row #3. Press a row to open it: the code now, the suggested code, then why it matters. ← Back or Esc returns.
4. Change the list in chat. *"remove 3"* deletes #3; the other numbers stay. *"make #2 low"* or *"#4 is only medium"* changes only that field of the finding. On their PR, *"drop 3"* and *"add 3 to the review"* work like the buttons. A comment already posted on GitHub can't be changed from the panel: change it on GitHub.

### Your own branch

Run the review with no PR link. On each finding:

| Button | Key | What it does |
|---|---|---|
| Add to fix list | `f` | Queues it. Nothing is fixed yet |
| Won't fix | `w` | Closes it without changing code |
| Ask Claude | `a` | Puts the finding in the prompt box, so you can ask about it |
| Delete | `x` | Deletes the finding, after you confirm |

You can also just say *"fix 3"*. Then press **N queued · Fix all**. After you confirm, Claude fixes the whole list in one commit, with a normal message about the change.

### Someone else's PR

Run the review with a PR link. Each finding comes with a comment draft for the author. The draft you see is exactly what gets posted.

| Button | Key | What it does |
|---|---|---|
| Add to review | `p` | Puts the draft in the pending pile. Nothing is posted yet |
| Drop | `d` | Skips the finding |
| Edit | `e` | Change the draft's words directly |
| Rewrite | `r` | Tell Claude how to change it: *"softer"*, *"drop the code"* |
| Delete | `x` | Deletes the finding, after you confirm. Not shown once it is posted |

**N pending · Submit review** posts every pending draft as one GitHub review, each comment on its line. You pick Comment (the default), Request changes or Approve, and confirm first.

### Re-check

Press **Re-check**, or say *"re-check"*. Each finding you acted on gets ✅ addressed, ⚠️ addressed wrongly, or ❌ not addressed. Every commit since the last review is reviewed again, and new problems show under **New in round 2**.

On someone else's PR, just ask *"are my comments on https://github.com/… addressed?"*, even in a new session. The panel rebuilds the list from your own comments on GitHub. It counts the comments that start a thread, resolved ones included, and reviews from the commit of your last review. Every reply on each thread, yours included, and the PR conversation (comments and review bodies, bots left out) are read before an outcome is given. A reply can settle a finding without a code change: if you agreed with the author to leave it as is or do it later, it counts as ✅ addressed. Rows whose last reply is the author's show **author replied**, and the finding shows the replies.

### When nothing is left

The panel suggests **Approve PR** on their PR, or **Create PR** on your branch if it isn't on GitHub yet. Both ask you to confirm.

## Levels

Claude picks the first level whose description fits, from the top:

| Level | What goes in it | Example |
|---|---|---|
| **xhigh** | Wrong output, a crash, data loss or a security hole on a path normal use reaches; or a spec requirement that isn't met | The retry loop never stops when the server returns 503 |
| **high** | A written rule (AGENTS.md, CLAUDE.md, a style guide) is broken; a bug that needs unusual input or state; or scope creep: a change whose effect reaches past what the PR is about, which the PR doesn't mention | A PR about the login form changes a shared `Button` default |
| **medium** | Nothing goes wrong now, but the code is harder to read, change or test | The same date parsing copied in three files |
| **low** | Style, formatting, or a preference no written rule backs | Trailing commas, import order |

- **Scope creep** means a change to something used outside the PR's area: shared components and utilities, lint, tsconfig, build or CI config, environment defaults, dependency versions, database schema, anything imported from many places. It counts only when the PR title, description and commit messages don't mention it. If the change breaks something in normal use, it's **xhigh**.
- **Checked before it's recorded.** Claude reads the code at the finding's line, its callers and its tests, and tries to show the finding is wrong before it records it.
- **high and xhigh need evidence.** Claude has to give what goes wrong (inputs, state and the wrong result) and the code it read (file:line ranges). Without them the tool refuses, and the finding is **medium** at most. A finding's detail shows both under **What goes wrong** and **Code read**.
- A review saved by an older version comes back on resume with levels: 9–10 xhigh, 6–8 high, 3–5 medium, 1–2 low.

## Good to know

- **One review per session.** Starting a review of another PR asks before it replaces the one shown. `/clear` starts empty.
- **Resume:** `claude --resume` brings the session's review back. It is saved under that session only and deleted after 7 days.
- **Rewrite** uses a small Sonnet call. If it gives no answer, the draft stays as it was and the panel says so.
- The review tool's calls show as one line each in the conversation.

## Requirements

- Claude Code 2.1.288 or newer. The plugin uses function hooks, which Claude Code marks as early access.
- The `mattpocock-skills` plugin, for its code-review skill.
- `gh`, signed in, for posting reviews, approving and re-checking their PR.

## Develop

```
claude --plugin-dir ./plugins/code-review-mod   # load from this folder
claude plugin test ./plugins/code-review-mod    # run the tests
claude plugin validate ./plugins/code-review-mod
```
